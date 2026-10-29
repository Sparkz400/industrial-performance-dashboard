import { readFileSync } from "node:fs";
import * as client from "openid-client";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { UserRole } from "@performance-dashboard/shared";
import config from "../config/config.js";
import db from "../database/db.js";
import {
  oidcGroupMappings,
  plantMemberships,
  users,
} from "../database/schema.js";
import { pinnedFetch } from "../utils/pinnedFetch.js";
import { ConflictError, ForbiddenError } from "../utils/errors.js";

// E02: authorization code flow with PKCE against one configured issuer.
const LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";
const ROLE_ORDER: UserRole[] = [
  "wallboard",
  "viewer",
  "operator",
  "supervisor",
];

// The read-only recovery preview creates no accounts; local sign-in applies there.
export const oidcEnabled = () =>
  Boolean(config.OIDC_ISSUER) && !config.RECOVERY_MODE;

const fetchOverride = () =>
  config.OIDC_CA_FILE
    ? pinnedFetch(readFileSync(config.OIDC_CA_FILE, "utf8"))
    : undefined;

let discovered: Promise<client.Configuration> | undefined;
let keys: ReturnType<typeof createRemoteJWKSet> | undefined;
function configuration() {
  discovered ??= (() => {
    const fetch = fetchOverride();
    return client.discovery(
      new URL(config.OIDC_ISSUER!),
      config.OIDC_CLIENT_ID!,
      undefined,
      client.ClientSecretBasic(config.OIDC_CLIENT_SECRET!),
      fetch ? { [client.customFetch]: fetch } : undefined,
    );
  })().catch((error) => {
    discovered = undefined; // retry discovery on the next sign-in
    throw error;
  });
  return discovered;
}
/** Forget discovered metadata, for a changed configuration. */
export function resetOidc() {
  discovered = undefined;
  keys = undefined;
}

export interface PendingSignIn {
  verifier: string;
  state: string;
  nonce: string;
  startedAt: number;
}

export async function authorizationRequest() {
  const cfg = await configuration();
  const pending: PendingSignIn = {
    verifier: client.randomPKCECodeVerifier(),
    state: client.randomState(),
    nonce: client.randomNonce(),
    startedAt: Date.now(),
  };
  const url = client.buildAuthorizationUrl(cfg, {
    redirect_uri: config.OIDC_REDIRECT_URI!,
    scope: config.OIDC_SCOPES,
    code_challenge: await client.calculatePKCECodeChallenge(pending.verifier),
    code_challenge_method: "S256",
    state: pending.state,
    nonce: pending.nonce,
  });
  return { url, pending };
}

/** Exchanges the code; openid-client checks issuer, audience, signature, expiry, nonce and state. */
export async function completeSignIn(query: string, pending: PendingSignIn) {
  const cfg = await configuration();
  const callback = new URL(config.OIDC_REDIRECT_URI!);
  callback.search = query;
  const tokens = await client.authorizationCodeGrant(cfg, callback, {
    pkceCodeVerifier: pending.verifier,
    expectedState: pending.state,
    expectedNonce: pending.nonce,
    idTokenExpected: true,
  });
  return tokens.claims()!;
}

/**
 * Maps the identity's groups onto a non-admin role and site memberships and returns the
 * account. Admin is never granted by a group; an administrator may promote the account,
 * which is kept while any mapped group remains. No mapped group means no access.
 */
export async function signInAccount(claims: client.IDToken) {
  const raw = claims[config.OIDC_GROUPS_CLAIM];
  const groups = Array.isArray(raw)
    ? raw.filter((g): g is string => typeof g === "string")
    : [];
  const mappings = groups.length
    ? await db
        .select()
        .from(oidcGroupMappings)
        .where(inArray(oidcGroupMappings.groupName, groups))
    : [];
  if (!mappings.length)
    throw new ForbiddenError(
      "None of your identity-provider groups grants access to this dashboard. Ask an administrator.",
    );
  const mapped = mappings
    .map((m) => m.role)
    .sort((a, b) => ROLE_ORDER.indexOf(b) - ROLE_ORDER.indexOf(a))[0];
  const plantIds = [...new Set(mappings.flatMap((m) => m.plantIds))];
  const issuer = claims.iss,
    subject = claims.sub;
  return db.transaction(async (tx) => {
    let [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.oidcIssuer, issuer), eq(users.oidcSubject, subject)))
      .for("update");
    if (!user) {
      const name = String(
        claims.preferred_username ?? claims.email ?? subject,
      ).slice(0, 100);
      const email =
        typeof claims.email === "string" && claims.email_verified !== false
          ? claims.email.slice(0, 255)
          : null;
      // Never attach an identity-provider login to an existing account by name or email.
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          email
            ? sql`${users.username} = ${name} OR ${users.email} = ${email}`
            : eq(users.username, name),
        );
      if (taken)
        throw new ConflictError(
          `An account named "${name}" or with this email already exists. An administrator must rename or remove it before this sign-in can create an account.`,
        );
      [user] = await tx
        .insert(users)
        .values({
          username: name,
          email,
          role: mapped,
          authSource: "oidc",
          oidcIssuer: issuer,
          oidcSubject: subject,
        })
        .returning();
    } else {
      if (!user.isActive)
        throw new ForbiddenError(
          "Account is deactivated. Contact an administrator.",
        );
      const role = user.role === "admin" ? "admin" : mapped;
      // A role change ends the account's other sessions through the version check.
      if (role !== user.role)
        [user] = await tx
          .update(users)
          .set({ role, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
    }
    await tx
      .delete(plantMemberships)
      .where(eq(plantMemberships.userId, user.id));
    if (plantIds.length)
      await tx
        .insert(plantMemberships)
        .values(
          plantIds.map((plantId) => ({
            userId: user.id,
            plantId,
            role: mapped,
          })),
        );
    return { user, groups: mappings.map((m) => m.groupName) };
  });
}

/** OIDC Back-Channel Logout 1.0 §2.6 checks; returns the session or subject to end. */
export async function verifyLogoutToken(token: string) {
  const cfg = await configuration();
  const metadata = cfg.serverMetadata();
  const fetch = fetchOverride();
  keys ??= createRemoteJWKSet(
    new URL(metadata.jwks_uri!),
    fetch ? { [customFetch]: fetch } : {},
  );
  const { payload } = await jwtVerify(token, keys, {
    issuer: metadata.issuer,
    audience: config.OIDC_CLIENT_ID,
    requiredClaims: ["iat", "jti"],
    maxTokenAge: "5m",
  });
  const events = payload.events as Record<string, unknown> | undefined;
  if (
    typeof events?.[LOGOUT_EVENT] !== "object" ||
    events[LOGOUT_EVENT] === null
  )
    throw new Error("Not a back-channel logout token");
  if ("nonce" in payload) throw new Error("A logout token carries no nonce");
  const sid = typeof payload.sid === "string" ? payload.sid : undefined;
  if (!sid && !payload.sub)
    throw new Error("A logout token names a session or subject");
  return { issuer: metadata.issuer, subject: payload.sub, sid };
}
