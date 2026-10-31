import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { createReadStream } from "node:fs";
import {
  readFile,
  writeFile,
  copyFile,
  readdir,
  lstat,
  realpath,
} from "node:fs/promises";
import {
  dirname,
  join,
  resolve,
  basename,
  relative,
  isAbsolute,
} from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Unprioritized acceptance gates and open P0/P1 items must remain visible. */
export function openAcceptanceItems(todo) {
  return [
    ...todo.matchAll(/^- \[ \] \*\*([A-Z]+\d+) — ([^*]+)\*\*(?: · (P\d)\b)?/gm),
  ]
    .filter(([, , , priority]) => !priority || ["P0", "P1"].includes(priority))
    .map(
      ([, id, title, priority]) =>
        `${id} (${priority ?? "acceptance"}): ${title.trim().replace(/:$/, "")}`,
    );
}

/** Merged pull requests on the first-parent history since `previous`. */
export function mergedChanges(previous) {
  return parseChanges(
    execFileSync(
      "git",
      [
        "log",
        "--first-parent",
        "--format=%s%x1f%b%x1e",
        previous ? `${previous}..HEAD` : "HEAD",
      ],
      { encoding: "utf8" },
    ),
  );
}

/** `git log --format=%s%x1f%b%x1e` output: a merged PR becomes "#N <PR title>". */
export function parseChanges(log) {
  return log
    .split("\x1e")
    .map((entry) => entry.trim().split("\x1f"))
    .filter(([subject]) => subject)
    .map(([subject, body = ""]) => {
      const pr = subject.match(/^Merge pull request (#\d+)/);
      return pr ? `${pr[1]} ${body.trim().split("\n")[0]}` : subject;
    });
}

export function releaseNotes({
  version,
  revision,
  createdAt,
  previous,
  changes,
  newMigrations,
  openItems,
}) {
  const list = (items, empty) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`;
  return `# Performance Dashboard ${version}

Source revision \`${revision}\`, packaged ${createdAt}.
Physical machine qualification: **not established** for this release.

## Changes since ${previous ?? "the start of the history"}

${list(changes, "No merged changes")}

## New database migrations

${list(newMigrations, "None")}

Migrations are additive and run at startup; keep the complete pre-upgrade backup for
rollback (OPERATIONS.md).

## Open acceptance items

These P0/P1 items and unprioritized gates were open in TODO.md at this revision. The release label does not
close them.

${list(openItems, "None")}

Compatibility evidence, including what was only simulated, is in COMPATIBILITY.md.
`;
}
const fileDigest = async (path) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};
export async function verifyRelease(directory, publicKeyFile) {
  const bytes = await readFile(join(directory, "release.json"));
  const publicKey = createPublicKey(await readFile(publicKeyFile));
  assert.equal(
    publicKey.asymmetricKeyType,
    "ed25519",
    "Use an independently trusted Ed25519 public key",
  );
  assert(
    verify(
      null,
      bytes,
      publicKey,
      await readFile(join(directory, "release.sig")),
    ),
    "Release signature rejected",
  );
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.format, "performance-dashboard-release-v1");
  assert.match(manifest.revision, /^[a-f0-9]{40}$/);
  assert.match(manifest.appImage, /^sha256:[a-f0-9]{64}$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
  assert.equal(manifest.physicalQualification, false);
  for (const required of [
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
    "COMPATIBILITY.md",
    "OPERATIONS.md",
    "LICENSE",
  ])
    assert(
      Object.hasOwn(manifest.files, required),
      `Missing required release file: ${required}`,
    );
  const expected = new Set([
    ...Object.keys(manifest.files),
    "release.json",
    "release.sig",
  ]);
  assert.deepEqual(
    (await readdir(directory)).sort(),
    [...expected].sort(),
    "Unexpected or missing package file",
  );
  for (const [name, hash] of Object.entries(manifest.files)) {
    assert(
      name === basename(name) &&
        !/[\\/:]/.test(name) &&
        name !== "." &&
        name !== "..",
      "Unsafe manifest file path",
    );
    const path = join(directory, name);
    const stat = await lstat(path);
    assert(
      stat.isFile() && !stat.isSymbolicLink(),
      "Package entries must be regular files",
    );
    assert.equal(
      await fileDigest(path),
      hash,
      `Release integrity mismatch: ${name}`,
    );
  }
  const evidence = JSON.parse(
    await readFile(join(directory, "evidence.json"), "utf8"),
  );
  assert.equal(evidence.sourceRevision, manifest.revision);
  assert.equal(evidence.imageDigest, manifest.appImage);
  assert.equal(evidence.passed, true);
  assert(
    Array.isArray(evidence.checks) &&
      evidence.checks.length > 0 &&
      evidence.checks.every((c) => c.passed === true),
  );
  const offline = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  assert.equal(offline.appImage, manifest.appImage);
  assert.equal(offline.databaseImage, manifest.databaseImage);
  return manifest;
}

async function run(exe, args) {
  const child = spawn(exe, args, {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "",
    err = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
  await new Promise((done, fail) => {
    child.on("error", fail);
    child.on("close", (c) =>
      c === 0 ? done() : fail(new Error(`${exe} failed: ${err}`)),
    );
  });
  return out.trim();
}

async function main() {
  const {
    values: o,
    positionals: [command],
  } = parseArgs({
    allowPositionals: true,
    options: {
      directory: { type: "string" },
      image: { type: "string" },
      version: { type: "string" },
      evidence: { type: "string" },
      "signing-key": { type: "string" },
      "public-key": { type: "string" },
      previous: { type: "string" },
      "database-image": { type: "string", default: "postgres:16-alpine" },
    },
  });
  assert(
    ["prepare", "create", "verify"].includes(command),
    "Use prepare|create|verify --directory PATH [--public-key TRUSTED_KEY]",
  );
  assert(o.directory && (command === "prepare" || o["public-key"]));
  const directory = resolve(o.directory);
  if (command === "verify") {
    const manifest = await verifyRelease(directory, o["public-key"]);
    console.log(
      JSON.stringify({
        verified: true,
        version: manifest.version,
        revision: manifest.revision,
        physicalQualification: false,
      }),
    );
    return;
  }
  assert(
    o.image &&
      o.version &&
      o.evidence &&
      (command === "prepare" || o["signing-key"]),
    "Packaging requires image, version and evidence; create also requires signing-key",
  );
  assert.match(o.version, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    "",
    "Release packaging requires a clean checkout",
  );
  const evidence = JSON.parse(await readFile(o.evidence, "utf8"));
  assert.equal(
    evidence.sourceRevision,
    revision,
    "Evidence must match the clean source revision",
  );
  assert.equal(evidence.passed, true);
  assert(
    Array.isArray(evidence.checks) &&
      evidence.checks.length > 0 &&
      evidence.checks.every((c) => c.passed === true),
    "Evidence must list passing checks",
  );
  const docker = process.env.DOCKER_BIN || "docker";
  const image = JSON.parse(await run(docker, ["image", "inspect", o.image]))[0];
  assert.equal(
    image.Config.Labels?.["org.opencontainers.image.revision"],
    revision,
    "Image must carry the source revision used to build it",
  );
  assert.equal(
    evidence.imageDigest,
    image.Id,
    "Evidence must identify the tested image digest",
  );
  let privateKey;
  if (command === "create") {
    const privatePath = await realpath(o["signing-key"]);
    privateKey = createPrivateKey(await readFile(privatePath));
    assert.equal(privateKey.asymmetricKeyType, "ed25519");
    const trusted = createPublicKey(await readFile(o["public-key"]));
    assert.equal(
      createPublicKey(privateKey).export({ type: "spki", format: "pem" }),
      trusted.export({ type: "spki", format: "pem" }),
      "Signing and trusted verification keys must match",
    );
    const keyRelative = relative(directory, privatePath);
    assert(
      keyRelative.startsWith("..") || isAbsolute(keyRelative),
      "Signing key must remain outside the package",
    );
  }
  await run(process.execPath, [
    "scripts/offline-package.mjs",
    "create",
    "--directory",
    directory,
    "--image",
    image.Id,
    "--database-image",
    o["database-image"],
  ]);
  await copyFile(
    "scripts/release-package.mjs",
    join(directory, "release-package.mjs"),
  );
  const install = await readFile(join(directory, "INSTALL.txt"), "utf8");
  await writeFile(
    join(directory, "INSTALL.txt"),
    (command === "prepare"
      ? "UNSIGNED CANDIDATE: Publisher key custody and trust are pending. This package is for isolated rehearsal only, not a signed release. Hash verification does not authenticate a publisher. Regenerate with the create command and the trusted publisher key before release.\n\n"
      : "SIGNED RELEASE: Before running any script from this package, use an independently trusted copy of release-package.mjs and an independently trusted publisher public key:\nnode TRUSTED_VERIFIER_PATH verify --directory PACKAGE_DIRECTORY --public-key TRUSTED_PUBLIC_KEY_PATH\nThe bundled verifier and bundled public material cannot establish their own authenticity. Hash-only verification below detects corruption but does not authenticate the publisher. After signature verification succeeds, follow the installation steps below.\n\n") +
      install,
  );
  await copyFile(o.evidence, join(directory, "evidence.json"));
  await copyFile("LICENSE", join(directory, "LICENSE"));
  await copyFile("docs/OPERATIONS.md", join(directory, "OPERATIONS.md"));
  await copyFile("docs/COMPATIBILITY.md", join(directory, "COMPATIBILITY.md"));
  await copyFile(
    "docs/ACCEPTANCE_EXECUTION.md",
    join(directory, "ACCEPTANCE_EXECUTION.md"),
  );
  await copyFile("TODO.md", join(directory, "TODO.md"));
  const migrationFiles = (await readdir("server/drizzle"))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  const earlierMigrations = o.previous
    ? execFileSync(
        "git",
        ["ls-tree", "--name-only", `${o.previous}:server/drizzle`],
        { encoding: "utf8" },
      ).split("\n")
    : [];
  await writeFile(
    join(directory, "RELEASE-NOTES.md"),
    releaseNotes({
      version: o.version,
      revision,
      createdAt: new Date().toISOString(),
      previous: o.previous,
      changes: mergedChanges(o.previous),
      newMigrations: migrationFiles.filter(
        (name) => !earlierMigrations.includes(name),
      ),
      openItems: openAcceptanceItems(await readFile("TODO.md", "utf8")),
    }),
  );
  const migrationInventory = await Promise.all(
    migrationFiles.map(async (name) => ({
      name,
      sha256: digest(await readFile(join("server/drizzle", name))),
    })),
  );
  await writeFile(
    join(directory, "MIGRATIONS.json"),
    JSON.stringify(
      {
        policy:
          "Schema migrations run at startup; use the complete pre-upgrade backup for rollback.",
        migrations: migrationInventory,
      },
      null,
      2,
    ),
  );
  const npm =
    process.env.npm_execpath ||
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const sbom = JSON.parse(
    await run(process.execPath, [
      npm,
      "sbom",
      "--package-lock-only",
      "--sbom-format",
      "cyclonedx",
      "--sbom-type",
      "application",
    ]),
  );
  await writeFile(
    join(directory, "sbom.cdx.json"),
    JSON.stringify(sbom, null, 2),
  );
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  await writeFile(
    join(directory, "DEPENDENCY-NOTICES.txt"),
    "Source/build dependency inventory; package licenses and upstream notices remain applicable. The SBOM describes the locked application source, not all base-image operating-system packages.\n\n" +
      Object.entries(lock.packages)
        .map(
          ([name, p]) =>
            `${name || lock.name}\t${p.version || "workspace"}\t${p.license || "See upstream package license"}`,
        )
        .sort()
        .join("\n"),
  );
  const offline = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  const files = {};
  for (const name of (await readdir(directory)).sort())
    files[name] = await fileDigest(join(directory, name));
  const manifest = {
    format:
      command === "prepare"
        ? "performance-dashboard-unsigned-candidate-v1"
        : "performance-dashboard-release-v1",
    version: o.version,
    revision,
    appImage: image.Id,
    databaseImage: offline.databaseImage,
    platform: offline.platform,
    createdAt: new Date().toISOString(),
    physicalQualification: false,
    files,
  };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2));
  await writeFile(join(directory, "release.json"), bytes);
  if (privateKey)
    await writeFile(
      join(directory, "release.sig"),
      sign(null, bytes, privateKey),
    );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    revision,
  );
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    "",
    "Source changed while packaging",
  );
  if (command === "create") await verifyRelease(directory, o["public-key"]);
  else
    await run(process.execPath, [
      "scripts/offline-package.mjs",
      "verify",
      "--directory",
      directory,
    ]);
  console.log(
    JSON.stringify({
      created: true,
      signed: command === "create",
      directory,
      version: o.version,
      revision,
      physicalQualification: false,
    }),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
