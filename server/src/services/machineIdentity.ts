import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  randomBytes,
  X509Certificate,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isIP } from "node:net";
import { eq } from "drizzle-orm";
import {
  UserTokenType,
  type OPCUAClient,
  type UserIdentityInfo,
} from "node-opcua";
import { keyOperationsFromPrivateKey } from "node-opcua-crypto";
import type {
  MachineAuthentication,
  MachineAuthenticationInput,
} from "@performance-dashboard/shared";
import db from "../database/db.js";
import { machineCredentials } from "../database/schema.js";
import { ValidationError } from "../utils/errors.js";

type Credential = typeof machineCredentials.$inferSelect;
type Secret = {
  password?: string;
  certificatePem?: string;
  privateKeyPem?: string;
};

async function encryptionKey(create = false) {
  const file = resolve(
    process.env.MACHINE_SECRETS_KEY_FILE || "data/machine-secrets.key",
  );
  if (create) {
    await mkdir(dirname(file), { recursive: true });
    try {
      await writeFile(file, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const key = await readFile(file);
  if (key.length !== 32)
    throw new Error(
      "Machine credential key must contain 32 bytes; restore the original key from backup.",
    );
  return key;
}

export const sealMachineSecret = (machineId: number, secret: Secret) =>
  sealSecret(`machine:${machineId}`, secret);
export const openMachineSecret = (machineId: number, encrypted: string) =>
  openSecret(`machine:${machineId}`, encrypted);

/** AES-256-GCM with the installation's secret key; the context binds a secret to its use. */
export async function sealSecret(context: string, secret: Secret) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    await encryptionKey(true),
    nonce,
  );
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(secret), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString(
    "base64",
  );
}

export async function openSecret(
  context: string,
  encrypted: string,
): Promise<Secret> {
  try {
    const bytes = Buffer.from(encrypted, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await encryptionKey(),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw new Error(
      "Cannot decrypt machine credentials. Restore the matching credential key or replace the credentials.",
    );
  }
}

export function validateMachineSecurity(mode: string, policy: string) {
  if (
    !["None", "Sign", "SignAndEncrypt"].includes(mode) ||
    ![
      "None",
      "Basic256Sha256",
      "Aes128_Sha256_RsaOaep",
      "Aes256_Sha256_RsaPss",
    ].includes(policy) ||
    (mode === "None") !== (policy === "None")
  ) {
    throw new ValidationError(
      "Select a matching security mode and supported policy. Security is never downgraded automatically.",
    );
  }
}

export function validateCertificate(
  certificate: X509Certificate,
  now = Date.now(),
) {
  if (
    Date.parse(certificate.validFrom) > now ||
    Date.parse(certificate.validTo) <= now
  ) {
    throw new ValidationError(
      "Certificate is expired or not yet valid. Check the clocks and renew the certificate.",
    );
  }
}

export async function prepareMachineCredential(
  machineId: number,
  mode: string,
  policy: string,
  input: MachineAuthenticationInput | undefined,
  previous?: Credential,
) {
  validateMachineSecurity(mode, policy);
  const authentication =
    input ??
    (previous
      ? { mode: previous.mode, username: previous.username ?? undefined }
      : { mode: "anonymous" });
  if (authentication.mode === "anonymous") return null;
  if (mode !== "SignAndEncrypt")
    throw new ValidationError("Machine credentials require Sign and Encrypt.");
  const old =
    previous && previous.mode === authentication.mode
      ? await openMachineSecret(machineId, previous.encryptedSecret)
      : {};
  let secret: Secret;
  let username: string | null = null;
  let certificateExpiresAt: Date | null = null;
  if (authentication.mode === "username") {
    username = authentication.username?.trim() || null;
    const password =
      input?.password ||
      (previous?.username === username ? old.password : undefined);
    if (!username || !password)
      throw new ValidationError(
        "Enter the machine username and password. Changing the username requires a password.",
      );
    secret = { password };
  } else if (authentication.mode === "certificate") {
    if (Boolean(input?.certificatePem) !== Boolean(input?.privateKeyPem))
      throw new ValidationError(
        "Replace the user certificate and private key together.",
      );
    secret = {
      certificatePem: input?.certificatePem || old.certificatePem,
      privateKeyPem: input?.privateKeyPem || old.privateKeyPem,
    };
    try {
      if (!secret.certificatePem || !secret.privateKeyPem) throw new Error();
      const certificate = new X509Certificate(secret.certificatePem);
      validateCertificate(certificate);
      if (!certificate.checkPrivateKey(createPrivateKey(secret.privateKeyPem)))
        throw new Error();
      certificateExpiresAt = new Date(certificate.validTo);
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(
        "Provide a valid user certificate and its matching unencrypted PEM private key.",
      );
    }
  } else {
    throw new ValidationError("Unsupported machine authentication mode.");
  }
  return {
    machineId,
    mode: authentication.mode,
    username,
    certificateExpiresAt,
    encryptedSecret: await sealMachineSecret(machineId, secret),
    updatedAt: new Date(),
  };
}

export async function machineAuthentication(
  machineId: number,
): Promise<MachineAuthentication> {
  const [row] = await db
    .select({
      mode: machineCredentials.mode,
      username: machineCredentials.username,
      certificateExpiresAt: machineCredentials.certificateExpiresAt,
    })
    .from(machineCredentials)
    .where(eq(machineCredentials.machineId, machineId));
  return row
    ? {
        mode: row.mode as MachineAuthentication["mode"],
        username: row.username ?? undefined,
        certificateExpiresAt: row.certificateExpiresAt?.toISOString(),
      }
    : { mode: "anonymous" };
}

export function verifyServerIdentity(
  client: Pick<OPCUAClient, "serverCertificate">,
  endpoint: string,
  securityMode: string,
) {
  if (securityMode === "None") return;
  const raw = Array.isArray(client.serverCertificate)
    ? client.serverCertificate[0]
    : client.serverCertificate;
  if (!raw)
    throw new ValidationError("The server did not present a certificate.");
  const certificate = new X509Certificate(raw);
  validateCertificate(certificate);
  const host = new URL(endpoint).hostname.replace(/^\[|\]$/g, "");
  if (!(isIP(host) ? certificate.checkIP(host) : certificate.checkHost(host))) {
    throw new ValidationError(
      "The server certificate does not match the endpoint hostname or IP. Use a certified endpoint or renew the PLC certificate.",
    );
  }
}

export async function createMachineSession(
  client: OPCUAClient,
  machineId: number | undefined,
  endpoint: string,
  securityMode: string,
) {
  verifyServerIdentity(client, endpoint, securityMode);
  const [row] =
    machineId === undefined
      ? []
      : await db
          .select()
          .from(machineCredentials)
          .where(eq(machineCredentials.machineId, machineId));
  let identity: UserIdentityInfo = { type: UserTokenType.Anonymous };
  if (row) {
    if (securityMode !== "SignAndEncrypt")
      throw new ValidationError(
        "Machine credentials require Sign and Encrypt.",
      );
    const secret = await openMachineSecret(row.machineId, row.encryptedSecret);
    if (row.mode === "username" && row.username && secret.password) {
      identity = {
        type: UserTokenType.UserName,
        userName: row.username,
        password: secret.password,
      };
    } else if (
      row.mode === "certificate" &&
      secret.certificatePem &&
      secret.privateKeyPem
    ) {
      const certificate = new X509Certificate(secret.certificatePem);
      validateCertificate(certificate);
      identity = {
        type: UserTokenType.Certificate,
        certificateData: certificate.raw,
        keyOperations: keyOperationsFromPrivateKey({
          hidden: secret.privateKeyPem,
        }),
      };
    } else
      throw new Error(
        "Stored machine identity is invalid. Replace the credentials.",
      );
  }
  return client.createSession(identity);
}
