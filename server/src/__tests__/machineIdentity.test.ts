import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("../database/db.js", () => ({ default: {} }));
import {
  openMachineSecret,
  prepareMachineCredential,
  sealMachineSecret,
  validateMachineSecurity,
} from "../services/machineIdentity.js";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pd-identity-"));
  vi.stubEnv("MACHINE_SECRETS_KEY_FILE", join(directory, "key"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("machine identities", () => {
  it("encrypts with independent nonces and binds credentials to the machine", async () => {
    const secret = { password: "owned-fixture-secret" };
    const encrypted = await sealMachineSecret(1, secret);
    expect(encrypted).not.toContain(secret.password);
    expect(await sealMachineSecret(1, secret)).not.toBe(encrypted);
    expect(await openMachineSecret(1, encrypted)).toEqual(secret);
    await expect(openMachineSecret(2, encrypted)).rejects.toThrow(
      "Cannot decrypt",
    );
    const damaged = Buffer.from(encrypted, "base64");
    damaged[30] ^= 1;
    await expect(
      openMachineSecret(1, damaged.toString("base64")),
    ).rejects.toThrow("Cannot decrypt");
    expect((await readFile(process.env.MACHINE_SECRETS_KEY_FILE!)).length).toBe(
      32,
    );
  });
  it("does not replace a missing key when reading stored credentials", async () => {
    const encrypted = await sealMachineSecret(1, { password: "fixture" });
    await unlink(process.env.MACHINE_SECRETS_KEY_FILE!);
    await expect(openMachineSecret(1, encrypted)).rejects.toThrow("Restore");
    await expect(
      readFile(process.env.MACHINE_SECRETS_KEY_FILE!),
    ).rejects.toThrow();
  });
  it("retains a password on edit but requires a replacement when the username changes", async () => {
    const previous = (await prepareMachineCredential(
      1,
      "SignAndEncrypt",
      "Basic256Sha256",
      { mode: "username", username: "reader", password: "fixture" },
    ))!;
    const retained = await prepareMachineCredential(
      1,
      "SignAndEncrypt",
      "Basic256Sha256",
      { mode: "username", username: "reader", password: "" },
      previous,
    );
    expect(await openMachineSecret(1, retained!.encryptedSecret)).toEqual({
      password: "fixture",
    });
    await expect(
      prepareMachineCredential(
        1,
        "SignAndEncrypt",
        "Basic256Sha256",
        { mode: "username", username: "other" },
        previous,
      ),
    ).rejects.toThrow("requires a password");
    await expect(
      prepareMachineCredential(1, "None", "None", undefined, previous),
    ).rejects.toThrow("Sign and Encrypt");
    expect(
      await prepareMachineCredential(
        1,
        "None",
        "None",
        { mode: "anonymous" },
        previous,
      ),
    ).toBeNull();
  });
  it("rejects invalid security pairs and partial or malformed certificate identities", async () => {
    for (const [mode, policy] of [
      ["None", "Basic256Sha256"],
      ["Sign", "None"],
      ["Typo", "None"],
      ["SignAndEncrypt", "Basic128Rsa15"],
    ]) {
      expect(() => validateMachineSecurity(mode, policy)).toThrow(
        "never downgraded",
      );
    }
    await expect(
      prepareMachineCredential(1, "SignAndEncrypt", "Basic256Sha256", {
        mode: "certificate",
        certificatePem: "invalid",
      }),
    ).rejects.toThrow("together");
    await expect(
      prepareMachineCredential(1, "SignAndEncrypt", "Basic256Sha256", {
        mode: "certificate",
        certificatePem: "invalid",
        privateKeyPem: "invalid",
      }),
    ).rejects.toThrow("matching");
  });
});
