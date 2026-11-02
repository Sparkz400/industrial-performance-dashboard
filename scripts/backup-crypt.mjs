import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  appendFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const magic = Buffer.from("PD-BACKUP-1\n");
const inside = (root, path) => path === root || path.startsWith(root + sep);
async function entries(directory, root = directory, directories = []) {
  const result = [];
  for (const name of await readdir(directory)) {
    const path = join(directory, name),
      stat = await lstat(path);
    assert(!stat.isSymbolicLink(), "Backup links are not accepted");
    if (stat.isDirectory()) {
      directories.push(relative(root, path).split(sep).join("/"));
      result.push(...(await entries(path, root, directories)));
    } else {
      assert(stat.isFile(), "Backup entries must be regular files");
      result.push(relative(root, path).split(sep).join("/"));
    }
  }
  return result;
}
export async function cryptBackup(mode, input, output, keyFile) {
  assert(["encrypt", "decrypt"].includes(mode));
  input = resolve(input);
  output = resolve(output);
  keyFile = resolve(keyFile);
  assert(
    !inside(input, output) && !inside(output, input),
    "Use separate source and destination directories",
  );
  assert(
    !inside(input, keyFile) && !inside(output, keyFile),
    "Keep the encryption key outside both backups",
  );
  assert(
    !(await lstat(input)).isSymbolicLink(),
    "Backup links are not accepted",
  );
  const key = await readFile(keyFile);
  assert.equal(
    key.length,
    32,
    "Backup key must contain exactly 32 random bytes",
  );
  let names,
    directories = [];
  if (mode === "encrypt") names = await entries(input, input, directories);
  else {
    const manifest = JSON.parse(
      await readFile(join(input, "encrypted-backup.json"), "utf8"),
    );
    assert.equal(manifest.format, "pd-encrypted-backup-v1");
    names = manifest.files;
    directories = manifest.directories ?? [];
  }
  assert(Array.isArray(names) && names.length > 0 && names.length <= 100_000);
  assert.equal(new Set(names).size, names.length);
  assert(Array.isArray(directories) && directories.length <= 100_000);
  for (const name of [...names, ...directories])
    assert(
      typeof name === "string" &&
        !isAbsolute(name) &&
        !name.includes("\\") &&
        !name.includes(":") &&
        name.split("/").every((part) => part && part !== "." && part !== ".."),
      "Unsafe backup path",
    );
  await mkdir(output, { mode: 0o700 });
  for (const directory of directories)
    await mkdir(join(output, directory), { recursive: true, mode: 0o700 });
  const completed = [];
  for (const name of names) {
    const source = join(input, mode === "encrypt" ? name : name + ".enc");
    assert(
      inside(await realpath(input), await realpath(source)),
      "Backup path escapes its source directory",
    );
    const destination = join(output, mode === "encrypt" ? name + ".enc" : name);
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = destination + ".partial";
    const stat = await lstat(source);
    assert(
      stat.isFile() && !stat.isSymbolicLink(),
      "Backup links are not accepted",
    );
    if (mode === "encrypt") {
      const iv = randomBytes(12),
        cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(name));
      await writeFile(temporary, Buffer.concat([magic, iv]), {
        flag: "wx",
        mode: 0o600,
      });
      await pipeline(
        createReadStream(source),
        cipher,
        createWriteStream(temporary, { flags: "a" }),
      );
      await appendFile(temporary, cipher.getAuthTag());
    } else {
      assert(stat.size >= magic.length + 28, "Truncated encrypted backup");
      const file = await open(source, "r"),
        header = Buffer.alloc(magic.length + 12),
        tag = Buffer.alloc(16);
      try {
        await file.read(header, 0, header.length, 0);
        await file.read(tag, 0, 16, stat.size - 16);
      } finally {
        await file.close();
      }
      assert(
        header.subarray(0, magic.length).equals(magic),
        "Unknown backup format",
      );
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        header.subarray(magic.length),
      );
      cipher.setAAD(Buffer.from(name));
      cipher.setAuthTag(tag);
      const ciphertext =
        stat.size === header.length + 16
          ? Readable.from([])
          : createReadStream(source, {
              start: header.length,
              end: stat.size - 17,
            });
      await pipeline(
        ciphertext,
        cipher,
        createWriteStream(temporary, { flags: "wx", mode: 0o600 }),
      );
    }
    completed.push([temporary, destination]);
  }
  // Publish usable filenames only after every file has authenticated successfully.
  for (const [temporary, destination] of completed)
    await rename(temporary, destination);
  if (mode === "encrypt")
    await writeFile(
      join(output, "encrypted-backup.json"),
      JSON.stringify({
        format: "pd-encrypted-backup-v1",
        files: names,
        directories,
      }),
      { flag: "wx", mode: 0o600 },
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string" },
      output: { type: "string" },
      "key-file": { type: "string" },
    },
  });
  assert(
    values.input && values.output && values["key-file"],
    "encrypt|decrypt --input DIR --output NEW_DIR --key-file PRIVATE_KEY",
  );
  await cryptBackup(
    positionals[0],
    values.input,
    values.output,
    values["key-file"],
  );
  console.log(
    "Backup encryption operation complete. Verify the restored backup manifest before restoring. Keep the key separately.",
  );
}
