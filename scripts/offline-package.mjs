import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
const {
  values: o,
  positionals: [command],
} = parseArgs({
  allowPositionals: true,
  options: {
    directory: { type: "string" },
    image: { type: "string" },
    "database-image": { type: "string", default: "postgres:16-alpine" },
    project: { type: "string" },
    destination: { type: "string" },
    port: { type: "string", default: "3001" },
  },
});
assert(
  ["create", "verify", "install"].includes(command),
  "Use create|verify|install --directory DIRECTORY",
);
assert(o.directory);
const directory = resolve(o.directory),
  docker = process.env.DOCKER_BIN || "docker";
async function run(exe, args) {
  const child = spawn(exe, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "",
    err = "";
  child.stdout.on("data", (d) => {
    out += d;
  });
  child.stderr.on("data", (d) => {
    err = (err + d).slice(-2000);
  });
  await new Promise((done, fail) => {
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0 ? done() : fail(new Error(`${exe} failed: ${err}`)),
    );
  });
  return out.trim();
}
async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
if (command === "create") {
  assert(o.image, "--image must name the validated local application image");
  const app = JSON.parse(await run(docker, ["image", "inspect", o.image]))[0],
    db = JSON.parse(
      await run(docker, ["image", "inspect", o["database-image"]]),
    )[0];
  assert.equal(app.Os, db.Os);
  assert.equal(app.Architecture, db.Architecture);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory, { recursive: false });
  await run(docker, [
    "image",
    "save",
    "-o",
    join(directory, "images.tar"),
    o.image,
    o["database-image"],
  ]);
  await copyFile(
    fileURLToPath(import.meta.url),
    join(directory, "offline-package.mjs"),
  );
  await copyFile(
    join(dirname(fileURLToPath(import.meta.url)), "operate.mjs"),
    join(directory, "operate.mjs"),
  );
  const files = {};
  for (const name of ["images.tar", "offline-package.mjs", "operate.mjs"])
    files[name] = await digest(join(directory, name));
  const manifest = {
    format: "performance-dashboard-offline-v1",
    appImage: app.Id,
    databaseImage: db.Id,
    platform: `${app.Os}/${app.Architecture}`,
    files,
  };
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  await writeFile(
    join(directory, "INSTALL.txt"),
    `Prerequisites: Node.js 24 and a working Docker Engine with Compose already installed for ${manifest.platform}. No source build or network download is needed.\nVerify: node offline-package.mjs verify --directory .\nInstall into a NEW directory: node offline-package.mjs install --directory . --project factory-local --destination PATH_TO_NEW_INSTALL --port 3001\nInstallation starts in recovery preview. Review the generated initial-login.json privately, then activate with operate.mjs after site acceptance. No customer data or credentials are included. Keep manifest.json from a trusted distribution channel; hashes detect corruption, not an untrusted publisher.\n`,
  );
  console.log(JSON.stringify({ directory, ...manifest }));
} else {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.format, "performance-dashboard-offline-v1");
  for (const name of ["images.tar", "offline-package.mjs", "operate.mjs"])
    assert.equal(
      await digest(join(directory, name)),
      manifest.files[name],
      `Integrity mismatch: ${name}`,
    );
  for (const value of [manifest.appImage, manifest.databaseImage])
    assert.match(value, /^sha256:[a-f0-9]{64}$/);
  if (command === "install") {
    assert(
      o.project && o.destination,
      "Use --project and --destination for a new installation",
    );
    await run(docker, ["image", "load", "-i", join(directory, "images.tar")]);
    for (const id of [manifest.appImage, manifest.databaseImage])
      assert.equal(
        JSON.parse(await run(docker, ["image", "inspect", id]))[0].Id,
        id,
      );
    console.log(
      await run(process.execPath, [
        join(directory, "operate.mjs"),
        "install",
        "--project",
        o.project,
        "--directory",
        resolve(o.destination),
        "--image",
        manifest.appImage,
        "--database-image",
        manifest.databaseImage,
        "--port",
        o.port,
      ]),
    );
  } else console.log(`Verified offline package for ${manifest.platform}`);
}
