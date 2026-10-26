import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { X509Certificate } from "node:crypto";
import * as opcua from "node-opcua";
import {
  decodeRegister,
  readRegisters,
  validateGatewayConfig,
} from "./modbusRead.js";

/** A co-located, encrypted OPC UA view of one explicitly configured register block. */
export async function startLegacyGateway(input: unknown) {
  const config = validateGatewayConfig(input);
  const trustedClient = new X509Certificate(
    readFileSync(config.trustedClientCertificate),
  );
  if (
    Date.parse(trustedClient.validFrom) > Date.now() ||
    Date.parse(trustedClient.validTo) <= Date.now()
  )
    throw new Error(
      "The trusted dashboard client certificate is not currently valid",
    );
  const pki = new opcua.OPCUACertificateManager({
    rootFolder: resolve(config.pkiDirectory),
    automaticallyAcceptUnknownCertificate: false,
  });
  const certificateFile = resolve(config.pkiDirectory, "gateway.pem");
  if (existsSync(certificateFile) && !existsSync(pki.privateKey))
    throw new Error(
      "Gateway private key is missing; restore its backup instead of replacing the identity",
    );
  const applicationUri = `urn:performance-dashboard:gateway:${config.name}`;
  let server: opcua.OPCUAServer | undefined;
  try {
    await pki.initialize();
    if (!existsSync(certificateFile))
      await pki.createSelfSignedCertificate({
        outputFile: certificateFile,
        applicationUri,
        subject: `/CN=${config.name}`,
        dns: ["localhost"],
        ip: ["127.0.0.1"],
        startDate: new Date(Date.now() - 60000),
        validity: 365,
      });
    await pki.trustCertificate(trustedClient.raw);
    server = new opcua.OPCUAServer({
      port: config.opcuaPort,
      host: "127.0.0.1",
      hostname: "localhost",
      alternateHostname: ["127.0.0.1"],
      resourcePath: "/UA/LegacyGateway",
      securityModes: [opcua.MessageSecurityMode.SignAndEncrypt],
      securityPolicies: [opcua.SecurityPolicy.Basic256Sha256],
      allowAnonymous: true,
      serverCertificateManager: pki,
      userCertificateManager: new opcua.OPCUACertificateManager({
        rootFolder: resolve(config.pkiDirectory, "users"),
        automaticallyAcceptUnknownCertificate: false,
      }),
      certificateFile,
      privateKeyFile: pki.privateKey,
      serverInfo: { applicationUri },
    });
    await server.initialize();
    const space = server.engine.addressSpace!;
    const namespace = space.registerNamespace(config.namespaceUri);
    const device = namespace.addObject({
      organizedBy: space.rootFolder.objects,
      browseName: config.name,
    });
    const values = new Map(
      config.tags.map((tag) => [
        tag.key,
        new opcua.DataValue({
          statusCode: opcua.StatusCodes.BadWaitingForInitialData,
        }),
      ]),
    );
    for (const tag of config.tags)
      namespace.addVariable({
        componentOf: device,
        browseName: tag.key,
        nodeId: `ns=${namespace.index};s=${tag.key}`,
        dataType: "Double",
        accessLevel: "CurrentRead",
        userAccessLevel: "CurrentRead",
        minimumSamplingInterval: config.modbus.pollMs,
        value: { timestamped_get: () => values.get(tag.key)!.clone() },
      });
    await server.start();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bad = (key: string, statusCode: opcua.StatusCode) => {
      const previous = values.get(key)!;
      values.set(
        key,
        new opcua.DataValue({
          value: previous.value,
          sourceTimestamp: previous.sourceTimestamp,
          statusCode,
        }),
      );
    };
    const poll = async () => {
      try {
        const registers = await readRegisters(config.modbus);
        const observedAt = new Date();
        for (const tag of config.tags) {
          try {
            values.set(
              tag.key,
              new opcua.DataValue({
                value: {
                  dataType: opcua.DataType.Double,
                  value: decodeRegister(registers, tag),
                },
                statusCode: opcua.StatusCodes.Good,
                sourceTimestamp: observedAt,
              }),
            );
          } catch {
            bad(tag.key, opcua.StatusCodes.BadOutOfRange);
          }
        }
      } catch {
        for (const tag of config.tags)
          bad(tag.key, opcua.StatusCodes.BadNoCommunication);
      } finally {
        if (!stopped)
          timer = setTimeout(() => {
            pending = poll();
          }, config.modbus.pollMs);
      }
    };
    let pending = poll();
    let stopping: Promise<void> | undefined;
    return {
      config,
      server,
      certificateFile,
      stop: () => {
        if (!stopping) {
          stopped = true;
          clearTimeout(timer);
          stopping = pending.then(() => server!.shutdown(0));
        }
        return stopping;
      },
    };
  } catch (error) {
    if (server) await server.shutdown(0).catch(() => {});
    else await pki.dispose();
    throw error;
  }
}
