import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
vi.mock("../database/db.js", () => ({ default: {} }));
import certificates from "../opc-ua/services/certificateManager.js";
import config from "../config/config.js";

let directory: string;
const previous = config.OPCUA_PKI_DIR;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pd-cert-recovery-"));
  config.OPCUA_PKI_DIR = directory;
  await mkdir(join(directory, "own", "certs"), { recursive: true });
  await mkdir(join(directory, "own", "private"), { recursive: true });
});
afterEach(async () => {
  await certificates.dispose();
  config.OPCUA_PKI_DIR = previous;
  await rm(directory, { recursive: true, force: true });
});
it("never replaces a lost client key while opening an existing identity", async () => {
  const certificate = join(directory, "own", "certs", "client_certificate.pem");
  const key = join(directory, "own", "private", "private_key.pem");
  await writeFile(certificate, "Owned existing public identity");
  await expect(certificates.ensureInitialized()).rejects.toThrow(
    "Restore the matched identity",
  );
  await expect(readFile(key)).rejects.toThrow();
  expect(await readFile(certificate, "utf8")).toBe(
    "Owned existing public identity",
  );
});
it("does not silently replace a missing certificate or recreate a removed runtime identity", async () => {
  const key = join(directory, "own", "private", "private_key.pem");
  await writeFile(key, "Owned existing private identity");
  await expect(certificates.ensureInitialized()).rejects.toThrow(
    "Restore the matched identity",
  );
  expect(await readFile(key, "utf8")).toBe("Owned existing private identity");
  certificates.isInitialized = true;
  await expect(certificates.loadCertificates()).rejects.toThrow(
    "Restore the matched identity",
  );
  await expect(
    certificates.getClientOptions("SignAndEncrypt", "Basic256Sha256"),
  ).rejects.toThrow("Restore the matched identity");
  await expect(
    readFile(join(directory, "own", "certs", "client_certificate.pem")),
  ).rejects.toThrow();
});
