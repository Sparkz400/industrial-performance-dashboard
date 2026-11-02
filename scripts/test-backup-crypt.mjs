import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { cryptBackup } from "./backup-crypt.mjs";

const root = await mkdtemp(join(".local", "backup-crypt-")),
  input = join(root, "input"),
  key = join(root, "key");
await mkdir(input);
await writeFile(key, randomBytes(32));
await mkdir(join(input, "nested"));
await mkdir(join(input, "empty-directory"));
await writeFile(join(input, "manifest.json"), '{"fixture":true}');
await writeFile(join(input, "nested", "data"), randomBytes(2_000_000));
await writeFile(join(input, "empty"), "");
await cryptBackup("encrypt", input, join(root, "encrypted"), key);
await cryptBackup(
  "decrypt",
  join(root, "encrypted"),
  join(root, "restored"),
  key,
);
for (const name of ["manifest.json", "nested/data", "empty"])
  assert.deepEqual(
    await readFile(join(root, "restored", name)),
    await readFile(join(input, name)),
  );
assert((await stat(join(root, "restored", "empty-directory"))).isDirectory());
await writeFile(join(root, "wrong-key"), randomBytes(32));
await assert.rejects(
  cryptBackup(
    "decrypt",
    join(root, "encrypted"),
    join(root, "wrong"),
    join(root, "wrong-key"),
  ),
);
const corrupted = await readFile(join(root, "encrypted", "nested/data.enc"));
corrupted[50] ^= 1;
await writeFile(join(root, "encrypted", "nested/data.enc"), corrupted);
await assert.rejects(
  cryptBackup("decrypt", join(root, "encrypted"), join(root, "tampered"), key),
);
await assert.rejects(readFile(join(root, "tampered", "manifest.json")), {
  code: "ENOENT",
});
await writeFile(
  join(root, "encrypted", "encrypted-backup.json"),
  JSON.stringify({ format: "pd-encrypted-backup-v1", files: ["../escape"] }),
);
await assert.rejects(
  cryptBackup("decrypt", join(root, "encrypted"), join(root, "escape"), key),
  /Unsafe backup path/,
);
console.log(
  "PASS: encrypted backup round trip, empty/large files, wrong key, tamper rejection, unpublished partial restore and path traversal rejection",
);
