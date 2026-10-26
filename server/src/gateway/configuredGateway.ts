import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import config from "../config/config.js";
import certificates from "../opc-ua/services/certificateManager.js";
import { startLegacyGateway } from "./legacyGateway.js";

let gateway: Awaited<ReturnType<typeof startLegacyGateway>> | undefined;

export async function startConfiguredGateway() {
  if (config.RECOVERY_MODE || !config.ENABLE_LEGACY_GATEWAY) return;
  if (gateway) return gateway;
  const directory = resolve(dirname(config.OPCUA_SPOOL_PATH), "gateway");
  const input = JSON.parse(
    await readFile(resolve(directory, "config.json"), "utf8"),
  );
  await certificates.ensureInitialized();
  gateway = await startLegacyGateway({
    ...input,
    // Keep the gateway identity inside the same backed-up data volume.
    pkiDirectory: resolve(directory, "pki"),
    trustedClientCertificate: certificates.certificateFile,
  });
  return gateway;
}

export async function stopConfiguredGateway() {
  await gateway?.stop();
  gateway = undefined;
}
