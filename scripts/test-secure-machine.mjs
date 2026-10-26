import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID, X509Certificate } from "node:crypto";
import * as opcua from "node-opcua";

// Runs inside test-production's isolated database, browser and owned PKI directory.
export async function testSecureMachine({
  call,
  page,
  frontend,
  pool,
  directory,
  multiMachine,
  waitFor,
}) {
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const password = randomUUID();
  const serverCertificates = new opcua.OPCUACertificateManager({
    rootFolder: join(directory, "secure-server-pki"),
    automaticallyAcceptUnknownCertificate: false,
  });
  await serverCertificates.initialize();
  const certificateFile = join(directory, "secure-server.pem");
  await serverCertificates.createSelfSignedCertificate({
    outputFile: certificateFile,
    applicationUri: "urn:localhost:secure-pilot",
    subject: "/CN=Owned secure pilot",
    dns: ["localhost"],
    ip: ["127.0.0.1"],
    startDate: new Date(Date.now() - 60000),
    validity: 30,
  });
  const server = new opcua.OPCUAServer({
    port,
    hostname: "localhost",
    alternateHostname: ["127.0.0.1"],
    resourcePath: "/UA/SecurePilot",
    securityModes: [opcua.MessageSecurityMode.SignAndEncrypt],
    securityPolicies: [opcua.SecurityPolicy.Basic256Sha256],
    allowAnonymous: false,
    userManager: {
      isValidUser: (user, supplied) =>
        user === "pilot-reader" && supplied === password,
    },
    certificateFile,
    privateKeyFile: serverCertificates.privateKey,
    serverInfo: { applicationUri: "urn:localhost:secure-pilot" },
    serverCertificateManager: serverCertificates,
    userCertificateManager: new opcua.OPCUACertificateManager({
      rootFolder: join(directory, "secure-user-pki"),
      automaticallyAcceptUnknownCertificate: false,
    }),
  });
  let machineId;
  try {
    await server.initialize();
    server.engine.addressSpace.getOwnNamespace().addVariable({
      organizedBy: server.engine.addressSpace.rootFolder.objects,
      browseName: "Count",
      nodeId: "ns=1;s=Count",
      dataType: "Int32",
      minimumSamplingInterval: 100,
      value: new opcua.Variant({ dataType: opcua.DataType.Int32, value: 7 }),
    });
    await server.start();
    const certificates = (
      await import("../server/dist/src/opc-ua/services/certificateManager.js")
    ).default;
    await certificates.ensureInitialized();
    await server.serverCertificateManager.trustCertificate(
      new X509Certificate(await readFile(certificates.certificateFile)).raw,
    );
    await page.goto(`${frontend}/machines`);
    await page.getByRole("button", { name: /add machine/i }).click();
    await page
      .getByLabel("Machine Name")
      .fill("Owned secure S7-1500 pilot simulator");
    await page.getByLabel("IP Address").fill("localhost");
    await page.getByRole("spinbutton", { name: /Port/ }).fill(String(port));
    await page.getByLabel("Resource Path").fill("/UA/SecurePilot");
    await page.getByLabel("Machine authentication").click();
    await page.getByRole("option", { name: "Username and password" }).click();
    await page.getByLabel("Machine username").fill("pilot-reader");
    await page.getByLabel("Machine password").fill(password);
    await page.getByLabel("Active", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    const response = await call("GET", "/api/v1/machines");
    const body = await response.text();
    assert.ok(!body.includes(password) && !body.includes("encryptedSecret"));
    const machine = JSON.parse(body).find(
      (m) => m.name === "Owned secure S7-1500 pilot simulator",
    );
    assert.ok(machine);
    machineId = machine.id;
    assert.equal(machine.authentication.mode, "username");
    const stored = (
      await pool.query(
        "SELECT encrypted_secret FROM machine_credentials WHERE machine_id=$1",
        [machineId],
      )
    ).rows[0];
    assert.ok(
      stored.encrypted_secret && !stored.encrypted_secret.includes(password),
    );
    const { commissioningService } =
      await import("../server/dist/src/services/commissioningService.js");
    await assert.rejects(
      commissioningService.inspect(machineId),
      /certificate|BadSecurity/i,
    );
    await certificates.trustCertificate(
      server.getCertificate(),
      "owned-secure-pilot",
    );
    const inspected = await commissioningService.inspect(machineId);
    assert.equal(inspected.identity, "username");
    assert.equal(inspected.securityMode, "SignAndEncrypt");
    assert.ok((await multiMachine.browseNodes(machineId)).length > 0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    assert.equal(await page.getByLabel("Machine password").inputValue(), "");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      (await commissioningService.inspect(machineId)).identity,
      "username",
    );
    const draft = {
      name: machine.name,
      ip: "localhost",
      port,
      resourcePath: "/UA/SecurePilot",
      securityMode: "SignAndEncrypt",
      securityPolicy: "Basic256Sha256",
      isActive: false,
    };
    assert.equal(
      (
        await call("PUT", `/api/v1/machines/${machineId}`, {
          ...draft,
          securityMode: "None",
          securityPolicy: "None",
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await call("PUT", `/api/v1/machines/${machineId}`, {
          ...draft,
          authentication: {
            mode: "username",
            username: "pilot-reader",
            password: randomUUID(),
          },
        })
      ).status(),
      200,
    );
    await assert.rejects(
      commissioningService.inspect(machineId),
      /BadUserAccessDenied|BadIdentityToken/i,
    );
    assert.equal(
      (
        await call("PUT", `/api/v1/machines/${machineId}`, {
          ...draft,
          authentication: {
            mode: "username",
            username: "pilot-reader",
            password,
          },
        })
      ).status(),
      200,
    );
    const certificatePem = await readFile(certificates.certificateFile, "utf8");
    const privateKeyPem = await readFile(certificates.privateKeyFile, "utf8");
    assert.equal(
      (
        await call("PUT", `/api/v1/machines/${machineId}`, {
          ...draft,
          authentication: {
            mode: "certificate",
            certificatePem,
            privateKeyPem,
          },
        })
      ).status(),
      200,
    );
    await assert.rejects(
      commissioningService.inspect(machineId),
      /BadIdentityToken|BadUserAccessDenied|certificate/i,
    );
    await server.userCertificateManager.trustCertificate(
      new X509Certificate(certificatePem).raw,
    );
    assert.equal(
      (await commissioningService.inspect(machineId)).identity,
      "certificate",
    );
    await page.reload();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("User certificate (PEM)").fill(certificatePem);
    await page
      .getByLabel("User private key (PEM)")
      .setInputFiles({
        name: "owned-user.key",
        mimeType: "application/x-pem-file",
        buffer: Buffer.from(privateKeyPem),
      });
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(
      (await commissioningService.inspect(machineId)).identity,
      "certificate",
    );
    assert.equal(
      (
        await call("PUT", `/api/v1/machines/${machineId}`, {
          ...draft,
          authentication: {
            mode: "username",
            username: "pilot-reader",
            password,
          },
        })
      ).status(),
      200,
    );
    const { verifyServerIdentity, validateCertificate } =
      await import("../server/dist/src/services/machineIdentity.js");
    const certificate = new X509Certificate(server.getCertificate());
    assert.throws(
      () =>
        verifyServerIdentity(
          { serverCertificate: certificate.raw },
          `opc.tcp://wrong.invalid:${port}`,
          "SignAndEncrypt",
        ),
      /does not match/,
    );
    assert.throws(
      () =>
        validateCertificate(certificate, Date.parse(certificate.validTo) + 1),
      /expired/,
    );
    assert.throws(
      () =>
        validateCertificate(certificate, Date.parse(certificate.validFrom) - 1),
      /not yet valid/,
    );
    await call("POST", `/api/v1/machines/${machineId}/mappings`, {
      mappings: [
        {
          nodeId: "ns=1;s=Count",
          nodeKey: "SecureCount",
          displayName: "Secure count",
          dataType: "Int32",
          samplingInterval: 100,
          isActive: true,
        },
      ],
    });
    await call("PUT", `/api/v1/machines/${machineId}`, {
      ...draft,
      isActive: true,
    });
    const worker = (
      await import("../server/dist/src/queue/opcuaQueueWorker.js")
    ).default;
    await waitFor(async () => {
      await worker.processBatch();
      return (
        (
          await pool.query(
            "SELECT 1 FROM opcua_data WHERE machine_id=$1 AND node_key='SecureCount'",
            [machineId],
          )
        ).rowCount > 0
      );
    }, "Secure subscription did not persist data");
    console.log(
      "PASS: secure browser onboarding, encrypted credentials, redaction, retained password, rejected downgrade, explicit certificate trust, wrong password, endpoint/expiry validation, authenticated browse/preflight and durable subscription",
    );
  } finally {
    if (machineId) await multiMachine.disconnectMachine(machineId);
    await server.shutdown(0);
    if (machineId)
      await pool.query("DELETE FROM machines WHERE id=$1", [machineId]);
  }
}
