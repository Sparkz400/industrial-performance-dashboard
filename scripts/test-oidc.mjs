import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createServer } from "node:https";
import { once } from "node:events";
import * as opcua from "node-opcua";
import Provider from "oidc-provider";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { dailyFixture } from "./daily-fixture.mjs";

// E02: single sign-on against an owned identity provider (HTTPS, pinned CA), group-to-role
// mapping, revocation and back-channel logout, and machine-scoped read-only service tokens.
await dailyFixture(async ({ pool, call, actors, api, frontend, browser, password, expect }) => {
  const directory = dirname(process.env.OPCUA_PKI_DIR);
  const certificate = async (name) => {
    const manager = new opcua.OPCUACertificateManager({ rootFolder: join(directory, `${name}-pki`), automaticallyAcceptUnknownCertificate: false });
    await manager.initialize();
    const file = join(directory, `${name}.pem`);
    await manager.createSelfSignedCertificate({
      outputFile: file,
      applicationUri: `urn:localhost:${name}`,
      subject: "/CN=localhost",
      dns: ["localhost"],
      ip: ["127.0.0.1"],
      startDate: new Date(Date.now() - 60000),
      validity: 1,
    });
    return { cert: await readFile(file, "utf8"), key: await readFile(manager.privateKey, "utf8"), file };
  };
  const idpTls = await certificate("idp");
  const strangerCa = await certificate("idp-stranger");

  const people = {
    alice: { preferred_username: "alice", email: "alice@example.com", email_verified: true, groups: ["pd-supervisors"] },
    bob: { preferred_username: "bob", groups: ["unrelated"] },
    clash: { preferred_username: "viewer", groups: ["pd-viewers"] }, // a local account has this name
  };
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const signingKey = { ...(await exportJWK(privateKey)), kid: "owned-1", use: "sig", alg: "RS256" };
  const callback = `${api}/api/v1/auth/oidc/callback`;
  const https = createServer({ cert: idpTls.cert, key: idpTls.key }).listen(0, "127.0.0.1");
  await once(https, "listening");
  const issuer = `https://localhost:${https.address().port}`;
  const client = (client_id, client_secret) => ({
    client_id,
    client_secret,
    redirect_uris: [callback],
    backchannel_logout_uri: `${api}/api/v1/auth/oidc/backchannel-logout`,
    backchannel_logout_session_required: true,
    grant_types: ["authorization_code"],
    response_types: ["code"],
  });
  const provider = new Provider(issuer, {
    clients: [client("dashboard", "owned-dashboard-secret"), client("other-app", "owned-other-secret")],
    jwks: { keys: [signingKey] },
    findAccount: (_ctx, id) =>
      people[id] && { accountId: id, claims: () => ({ sub: id, ...people[id] }) },
    claims: { openid: ["sub"], profile: ["preferred_username"], email: ["email", "email_verified"], groups: ["groups"] },
    scopes: ["openid", "profile", "email", "groups"],
    conformIdTokenClaims: false,
    features: { devInteractions: { enabled: true }, backchannelLogout: { enabled: true } },
    pkce: { required: () => true },
    cookies: { keys: ["owned-cookie-key"] },
    // The owned provider must reach the dashboard on loopback, which its SSRF guard refuses.
    fetch: (url, { dispatcher, ...options }) => globalThis.fetch(url, options),
  });
  https.on("request", provider.callback());

  const config = (await import("../server/dist/src/config/config.js")).default;
  const { resetOidc } = await import("../server/dist/src/services/oidc.js");
  const configure = (patch) => {
    Object.assign(config, patch);
    resetOidc();
  };
  const idpCa = join(directory, "idp-ca.pem");
  await writeFile(idpCa, idpTls.cert);
  configure({
    OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: "dashboard",
    OIDC_CLIENT_SECRET: "owned-dashboard-secret",
    OIDC_REDIRECT_URI: callback,
    OIDC_CA_FILE: idpCa,
    OIDC_DISPLAY_NAME: "Owned IdP",
    LOCAL_RECOVERY_ACCOUNTS: "admin",
  });

  try {
    const ok = async (role, method, path, body, status = 200) => {
      const r = await call(role, method, "/api/v1" + path, body);
      assert.equal(r.status(), status, `${method} ${path}: ${await r.text()}`);
      return r.status() === 204 ? null : r.json().catch(() => null);
    };
    const [{ id: site }] = (await pool.query("INSERT INTO plants(name,timezone) VALUES('Site A','UTC') RETURNING id")).rows;
    const machine = async (name, port) =>
      (await pool.query("INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES($1,$2,'127.0.0.1',false) RETURNING id", [name, `opc.tcp://127.0.0.1:${port}`])).rows[0].id;
    const siteMachine = await machine("Site A press", 49971),
      otherMachine = await machine("Other press", 49972);
    await pool.query("INSERT INTO machine_sites(machine_id,plant_id) VALUES($1,$2)", [siteMachine, site]);

    // Local sign-in: only the named recovery account may use a password, and it is audited.
    assert.deepEqual(
      { ...(await (await call("viewer", "GET", "/api/v1/auth/oidc/config")).json()) },
      { enabled: true, displayName: "Owned IdP", error: null },
    );
    const local = await call("operator", "POST", "/api/v1/auth/login", { username: "operator", password });
    assert.equal(local.status(), 403);
    assert.match(await local.text(), /Sign in with Owned IdP/);
    assert.equal((await call("admin", "POST", "/api/v1/auth/login", { username: "admin", password })).status(), 200);
    const recoveryAudit = await pool.query("SELECT count(*)::int n FROM audit_logs WHERE action='auth.recovery_login' AND entity_name='admin'");
    assert.equal(recoveryAudit.rows[0].n, 1);

    // Group mappings: admin is never granted by a group; unknown sites are refused.
    await ok("admin", "PUT", "/identity/group-mappings", { mappings: [{ groupName: "x", role: "admin", plantIds: [] }] }, 400);
    await ok("admin", "PUT", "/identity/group-mappings", { mappings: [{ groupName: "x", role: "viewer", plantIds: [site + 99] }] }, 400);
    await ok("viewer", "PUT", "/identity/group-mappings", { mappings: [] }, 403);
    await ok("admin", "PUT", "/identity/group-mappings", {
      mappings: [
        { groupName: "pd-supervisors", role: "supervisor", plantIds: [site] },
        { groupName: "pd-viewers", role: "viewer", plantIds: [] },
      ],
    });

    // Browser sign-in through the provider's own login and consent pages. Each sign-in uses a
    // fresh browser, so the provider asks for login and consent every time.
    const atProvider = async (page, login) => {
      await page.locator("input[name=login]").fill(login);
      await page.locator("input[name=password]").fill("any");
      await page.getByRole("button", { name: "Sign-in" }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForURL((url) => url.href.startsWith(frontend));
    };
    const signIn = async (login) => {
      const context = await browser.newContext({ ignoreHTTPSErrors: true }); // the browser only; the server pins the CA
      const page = await context.newPage();
      await page.goto(`${frontend}/login`);
      await page.getByRole("link", { name: "Sign in with Owned IdP" }).click();
      await atProvider(page, login);
      return { context, page };
    };
    const me = async (context) => (await context.request.get(`${api}/api/v1/auth/me`)).status();
    const sidOf = async (context) => {
      const cookie = (await context.cookies(api)).find((c) => c.name === "connect.sid");
      return decodeURIComponent(cookie.value).slice(2).split(".")[0];
    };
    const sessionRow = async (context) =>
      (await pool.query("SELECT sess FROM session WHERE sid=$1", [await sidOf(context)])).rows[0];

    const alice = await signIn("alice");
    await expect(alice.page).not.toHaveURL(/\/login/);
    let [account] = (await pool.query("SELECT * FROM users WHERE oidc_subject='alice'")).rows;
    assert.equal(account.auth_source, "oidc");
    assert.equal(account.role, "supervisor");
    assert.equal(account.password_hash, null);
    assert.equal(account.oidc_issuer, issuer);
    assert.deepEqual((await pool.query("SELECT plant_id FROM plant_memberships WHERE user_id=$1", [account.id])).rows, [{ plant_id: site }]);
    const assets = await (await alice.context.request.get(`${api}/api/v1/production/assets`)).json();
    assert.deepEqual(assets.map((a) => a.id), [siteMachine], "The mapped site grants its machines only");
    const sessionOf = async (subject) =>
      (await pool.query("SELECT sid, sess FROM session WHERE sess->>'oidcSubject'=$1", [subject])).rows;
    assert.equal((await sessionOf("alice")).length, 1);
    assert.ok((await sessionRow(alice.context)).sess.oidcSid, "The provider session id is kept for back-channel logout");

    // No mapped group: refused, and the reason is shown on the login page (not in the URL).
    const bob = await signIn("bob");
    await expect(bob.page.getByText("None of your identity-provider groups grants access")).toBeVisible();
    assert.doesNotMatch(bob.page.url(), /groups|error/);
    assert.equal((await pool.query("SELECT count(*)::int n FROM users WHERE oidc_subject='bob'")).rows[0].n, 0);
    // An existing local account is never taken over by name.
    const clash = await signIn("clash");
    await expect(clash.page.getByText('An account named "viewer"')).toBeVisible();

    // A group change applies at the next sign-in and ends the account's older sessions.
    people.alice.groups = ["pd-viewers"];
    const aliceAgain = await signIn("alice");
    [account] = (await pool.query("SELECT * FROM users WHERE oidc_subject='alice'")).rows;
    assert.equal(account.role, "viewer");
    assert.equal((await pool.query("SELECT count(*)::int n FROM plant_memberships WHERE user_id=$1", [account.id])).rows[0].n, 0);
    assert.equal(await me(alice.context), 401, "The supervisor session ended with the role change");
    assert.equal(await me(aliceAgain.context), 200);
    // An administrator's promotion is kept while a mapped group remains; without one, no sign-in.
    await ok("admin", "PUT", `/auth/users/${account.id}`, { role: "admin" });
    const promoted = await signIn("alice");
    assert.equal((await pool.query("SELECT role FROM users WHERE id=$1", [account.id])).rows[0].role, "admin");
    people.alice.groups = [];
    const removed = await signIn("alice");
    await expect(removed.page.getByText("None of your identity-provider groups grants access")).toBeVisible();
    people.alice.groups = ["pd-viewers"];
    await ok("admin", "PUT", `/auth/users/${account.id}`, { role: "viewer" });
    const live = await signIn("alice");
    assert.equal(await me(live.context), 200);
    assert.equal(await me(promoted.context), 401);

    // Back-channel logout: invalid tokens change nothing; the provider's token ends the session.
    const backchannel = (token) =>
      fetch(`${api}/api/v1/auth/oidc/backchannel-logout`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ logout_token: token }),
      }).then((r) => r.status);
    const { sess } = await sessionRow(live.context);
    const forged = (claims, { key = privateKey, iat = Math.floor(Date.now() / 1000) } = {}) =>
      new SignJWT({ events: { "http://schemas.openid.net/event/backchannel-logout": {} }, sid: sess.oidcSid, jti: crypto.randomUUID(), ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "owned-1", typ: "logout+jwt" })
        .setIssuer(issuer)
        .setAudience("dashboard")
        .setSubject("alice")
        .setIssuedAt(iat)
        .sign(key);
    const strangerKey = (await generateKeyPair("RS256")).privateKey;
    for (const [reason, token] of [
      ["wrong audience", await new SignJWT({ events: { "http://schemas.openid.net/event/backchannel-logout": {} }, sid: sess.oidcSid, jti: "a" }).setProtectedHeader({ alg: "RS256", kid: "owned-1" }).setIssuer(issuer).setAudience("other-app").setSubject("alice").setIssuedAt().sign(privateKey)],
      ["wrong issuer", await new SignJWT({ events: { "http://schemas.openid.net/event/backchannel-logout": {} }, sid: sess.oidcSid, jti: "b" }).setProtectedHeader({ alg: "RS256", kid: "owned-1" }).setIssuer("https://elsewhere.example").setAudience("dashboard").setSubject("alice").setIssuedAt().sign(privateKey)],
      ["too old", await forged({}, { iat: Math.floor(Date.now() / 1000) - 600 })],
      ["not a logout event", await forged({ events: {} })],
      ["carries a nonce", await forged({ nonce: "n" })],
      ["foreign key", await forged({}, { key: strangerKey })],
      ["not a token", "garbage"],
    ])
      assert.equal(await backchannel(token), 400, reason);
    assert.equal(await me(live.context), 200, "Rejected logout tokens end nothing");
    const dashboardClient = await provider.Client.find("dashboard");
    await dashboardClient.backchannelLogout("alice", sess.oidcSid);
    assert.equal(await me(live.context), 401, "The provider's logout ended the session");
    assert.equal(await sessionRow(live.context), undefined);
    assert.equal((await pool.query("SELECT count(*)::int n FROM audit_logs WHERE action='auth.backchannel_logout'")).rows[0].n, 1);

    // Maximum session age forces a return to the provider.
    const aged = await signIn("alice");
    assert.equal(await me(aged.context), 200);
    await pool.query("UPDATE session SET sess = jsonb_set(sess::jsonb, '{oidcAuthTime}', to_jsonb($1::bigint))::json WHERE sid=$2", [Date.now() - 9 * 3600_000, await sidOf(aged.context)]);
    assert.equal(await me(aged.context), 401);

    // A code issued to another client is refused at the callback.
    // The dashboard's own request (state, nonce, PKCE challenge) is replayed for another client.
    const swapContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const started = await swapContext.request.get(`${api}/api/v1/auth/oidc/start`, { maxRedirects: 0 });
    const authorize = new URL(started.headers().location);
    assert.equal(authorize.origin, issuer);
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
    authorize.searchParams.set("client_id", "other-app");
    const swap = await swapContext.newPage();
    await swap.goto(authorize.href);
    await atProvider(swap, "alice");
    await expect(swap.getByText("The identity provider's response was rejected")).toBeVisible();
    assert.equal(await me(swapContext), 401);

    // A wrong issuer or a certificate from another CA stops sign-in before any redirect.
    configure({ OIDC_ISSUER: `https://127.0.0.1:${https.address().port}` });
    assert.equal((await fetch(`${api}/api/v1/auth/oidc/start`, { redirect: "manual" })).status, 502);
    configure({ OIDC_ISSUER: issuer, OIDC_CA_FILE: strangerCa.file });
    assert.equal((await fetch(`${api}/api/v1/auth/oidc/start`, { redirect: "manual" })).status, 502);
    configure({ OIDC_CA_FILE: idpCa });

    // Service accounts: machine-scoped, read-only, contract endpoints only, token shown once.
    await ok("viewer", "POST", "/identity/service-accounts", { username: "mes-reader", machineIds: [siteMachine], expiresInDays: 30 }, 403);
    await ok("admin", "POST", "/identity/service-accounts", { username: "mes-reader", role: "admin", machineIds: [siteMachine], expiresInDays: 30 }, 400);
    const created = await ok("admin", "POST", "/identity/service-accounts", { username: "mes-reader", machineIds: [siteMachine], expiresInDays: 30 }, 201);
    const token = created.token.token;
    assert.match(token, /^pdsa_[A-Za-z0-9_-]{43}$/);
    const stored = (await pool.query("SELECT token_hash FROM service_tokens WHERE id=$1", [created.token.id])).rows[0].token_hash;
    assert.notEqual(stored, token, "Only the token's hash is stored");
    const listed = await ok("admin", "GET", "/identity/service-accounts");
    assert.equal(JSON.stringify(listed).includes(token), false, "Listings never return a token");
    const bearer = (path, init = {}, value = token) =>
      fetch(`${api}/api/v1${path}`, { ...init, headers: { authorization: `Bearer ${value}`, ...init.headers } });
    const window = `nodeKey=Pressure&start=${new Date(Date.now() - 3600_000).toISOString()}&end=${new Date().toISOString()}`;
    const read = await bearer("/production/assets");
    assert.equal(read.status, 200);
    assert.equal(read.headers.get("set-cookie"), null, "Token requests create no session");
    assert.deepEqual((await read.json()).map((a) => a.id), [siteMachine]);
    assert.equal((await bearer(`/history/${siteMachine}/summaries?${window}`)).status, 200);
    assert.equal((await bearer(`/history/${otherMachine}/summaries?${window}`)).status, 403, "Outside its machines");
    assert.equal((await bearer("/machines")).status, 403, "Not a contract endpoint");
    assert.equal((await bearer("/identity/service-accounts")).status, 403);
    assert.equal((await bearer("/production/operator/entries", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 403, "Never writes");
    assert.equal((await bearer("/production/assets", {}, "pdsa_" + "A".repeat(43))).status, 401);
    assert.equal((await bearer("/production/assets", {}, "pdsa_short")).status, 401);
    const loginAsService = await call("viewer", "POST", "/api/v1/auth/login", { username: "mes-reader", password: "anything" });
    assert.equal(loginAsService.status(), 401, "A service account cannot sign in");
    const rotated = await ok("admin", "POST", `/identity/service-accounts/${created.id}/tokens`, { expiresInDays: 1 }, 201);
    await ok("admin", "POST", `/identity/service-tokens/${created.token.id}/revoke`);
    assert.equal((await bearer("/production/assets")).status, 401, "Revoked");
    assert.equal((await bearer("/production/assets", {}, rotated.token)).status, 200, "The rotated token works");
    await pool.query("UPDATE service_tokens SET expires_at = now() - interval '1 second' WHERE id=$1", [rotated.id]);
    assert.equal((await bearer("/production/assets", {}, rotated.token)).status, 401, "Expired");
    const audits = (await pool.query("SELECT action FROM audit_logs WHERE action LIKE 'identity.%' ORDER BY id")).rows.map((r) => r.action);
    for (const action of ["identity.group_mappings.replaced", "identity.service_account.created", "identity.service_token.issued", "identity.service_token.revoked"])
      assert.ok(audits.includes(action), action);

    // The administrator works with mappings and service accounts in the browser.
    const page = await actors.admin.newPage();
    await page.goto(`${frontend}/settings`);
    await page.getByRole("tab", { name: "People & Access" }).click();
    await expect(page.getByLabel("Group").first()).toHaveValue("pd-supervisors");
    await page.getByLabel("Service account name").fill("historian-link");
    await page.getByLabel("Service account machines").click();
    await page.getByRole("option", { name: "Site A press" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Create service account" }).click();
    const shown = page.locator("code").filter({ hasText: /^pdsa_/ });
    await expect(shown).toBeVisible();
    assert.equal((await bearer("/production/assets", {}, await shown.textContent())).status, 200);
    await page.screenshot({ path: ".local/daily-evidence/identity.png", fullPage: true });
    const [{ id: browserToken }] = (await pool.query("SELECT t.id FROM service_tokens t JOIN users u ON u.id=t.user_id WHERE u.username='historian-link'")).rows;
    await page.getByRole("button", { name: `Revoke token ${browserToken}` }).click();
    await expect(page.getByText("Token revoked.")).toBeVisible();
    assert.equal((await bearer("/production/assets", {}, await shown.textContent().catch(() => ""))).status, 401);
    await page.close();

    console.log(JSON.stringify({ oidc: "passed", ssoAccounts: (await pool.query("SELECT count(*)::int n FROM users WHERE auth_source='oidc'")).rows[0].n }));
  } finally {
    configure({ OIDC_ISSUER: undefined });
    https.closeAllConnections();
    https.close();
  }
});
