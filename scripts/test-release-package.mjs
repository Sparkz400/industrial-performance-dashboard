import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { verifyRelease } from "./release-package.mjs";
await mkdir(".local", { recursive: true });
const root = await mkdtemp(resolve(".local", "release-signature-test-")),
  directory = join(root, "package");
await mkdir(directory);
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const keyFile = join(root, "trusted-public.pem");
await writeFile(keyFile, publicKey.export({ type: "spki", format: "pem" }));
const revision = "a".repeat(40),
  appImage = "sha256:" + "b".repeat(64),
  databaseImage = "sha256:" + "c".repeat(64);
const evidence = {
  sourceRevision: revision,
  imageDigest: appImage,
  passed: true,
  checks: [{ name: "synthetic-verifier-test", passed: true }],
};
const names = [
  "images.tar",
  "manifest.json",
  "offline-package.mjs",
  "operate.mjs",
  "release-package.mjs",
  "INSTALL.txt",
  "evidence.json",
  "sbom.cdx.json",
  "DEPENDENCY-NOTICES.txt",
  "MIGRATIONS.json",
  "RELEASE-NOTES.md",
  "OPERATIONS.md",
  "LICENSE",
];
const files = {};
for (const name of names) {
  const content =
    name === "evidence.json"
      ? JSON.stringify(evidence)
      : name === "manifest.json"
        ? JSON.stringify({ appImage, databaseImage })
        : "synthetic fixture";
  await writeFile(join(directory, name), content);
  files[name] = createHash("sha256").update(content).digest("hex");
}
const manifest = {
  format: "performance-dashboard-release-v1",
  version: "1.1.0-test",
  revision,
  appImage,
  databaseImage,
  physicalQualification: false,
  files,
};
async function save(value = manifest) {
  const bytes = Buffer.from(JSON.stringify(value));
  await writeFile(join(directory, "release.json"), bytes);
  await writeFile(
    join(directory, "release.sig"),
    sign(null, bytes, privateKey),
  );
}
await save();
assert.equal((await verifyRelease(directory, keyFile)).revision, revision);
await writeFile(join(directory, "images.tar"), "tampered");
await assert.rejects(verifyRelease(directory, keyFile), /integrity mismatch/);
await writeFile(join(directory, "images.tar"), "synthetic fixture");
await writeFile(
  join(directory, "untracked-secret.txt"),
  "must not be included",
);
await assert.rejects(verifyRelease(directory, keyFile), /Unexpected/);
// Keep only harmless test artifacts; use a fresh package for remaining negative cases.
const signature = await readFile(join(directory, "release.sig"));
signature[0] ^= 1;
await writeFile(join(directory, "release.sig"), signature);
await assert.rejects(verifyRelease(directory, keyFile), /signature rejected/);
const wrong = generateKeyPairSync("ed25519").publicKey;
await writeFile(
  join(root, "wrong.pem"),
  wrong.export({ type: "spki", format: "pem" }),
);
await save();
await assert.rejects(
  verifyRelease(directory, join(root, "wrong.pem")),
  /signature rejected/,
);
await save({ ...manifest, physicalQualification: true });
await assert.rejects(verifyRelease(directory, keyFile));
await writeFile(
  join(root, "validation.json"),
  JSON.stringify(
    {
      passed: true,
      checks: [
        "trusted signature",
        "content tampering",
        "extra files",
        "signature tampering",
        "wrong trusted key",
        "physical claim refused",
      ],
      synthetic: true,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ passed: true, directory: root }));
