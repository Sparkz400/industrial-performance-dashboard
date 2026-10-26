import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { startLegacyGateway } from "./legacyGateway.js";
import { validateGatewayConfig } from "./modbusRead.js";

const file = process.argv[2];
if (!file || process.argv.length !== 3)
  throw new Error(
    "Usage: node server/dist/src/gateway/runGateway.js path/to/gateway.json",
  );
const location = resolve(file);
const config = validateGatewayConfig(
  JSON.parse(await readFile(location, "utf8")),
);
config.pkiDirectory = resolve(dirname(location), config.pkiDirectory);
config.trustedClientCertificate = resolve(
  dirname(location),
  config.trustedClientCertificate,
);
const gateway = await startLegacyGateway(config);
console.log(
  `Read-only gateway listening at opc.tcp://localhost:${config.opcuaPort}/UA/LegacyGateway (SignAndEncrypt). Trust its gateway.pem certificate in the dashboard before commissioning.`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void gateway.stop().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
