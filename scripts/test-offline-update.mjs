import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  truncate,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";

// D07: update an offline installation from one signed package to the next. Both packages
// are built from real revisions; the installation never gets an internet route and the
// upgrade uses only the second package. Packages are signed with a throwaway fixture key.
const [previousRevision, nextRevision = "HEAD"] = process.argv.slice(2);
assert.ok(
  previousRevision,
  "Usage: node scripts/test-offline-update.mjs PREVIOUS_REVISION [NEXT_REVISION]",
);
const id = randomUUID().replaceAll("-", "").slice(0, 12),
  source = `pd-offupd-${id}`,
  rollback = `${source}-rollback`;
const directory = resolve(".local", `offline-update-${id}`);
await mkdir(dirname(directory), { recursive: true });
await mkdir(directory, { recursive: false });
const docker = process.env.DOCKER_BIN || "docker";
const stacks = [],
  images = [],
  logs = [];
async function run(executable, args, { cwd } = {}) {
  const child = spawn(executable, args, {
    cwd,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "",
    errors = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  await new Promise((done, fail) => {
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0 ? done() : fail(new Error(errors || output)),
    );
  });
  return output.trim();
}
const compose = (project, file, args) =>
  run(docker, ["compose", "-p", project, "-f", file, ...args]);
const sql = (project, file, query) =>
  compose(project, file, [
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "dashboard",
    "-d",
    "performance_dashboard",
    "-v",
    "ON_ERROR_STOP=1",
    "-tAc",
    query,
  ]);
async function freePort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signingKey = join(directory, "fixture-signing.pem"),
  trustedKey = join(directory, "fixture-public.pem");
await writeFile(
  signingKey,
  privateKey.export({ type: "pkcs8", format: "pem" }),
  { mode: 0o600 },
);
await writeFile(trustedKey, publicKey.export({ type: "spki", format: "pem" }));
// The verifier from this checkout is the independently trusted copy, not the package's.
const verify = (pkg) =>
  run(process.execPath, [
    resolve("scripts/release-package.mjs"),
    "verify",
    "--directory",
    pkg,
    "--public-key",
    trustedKey,
  ]);
async function buildPackage(label, revision, earlier) {
  const checkout = join(directory, `source-${label}`),
    tag = `${source}:${label}`;
  // Windows: deep source paths exceed 260 characters under .local without long paths.
  const git = (...args) => run("git", ["-c", "core.longpaths=true", ...args]);
  await git("clone", "--quiet", "--shared", "--no-checkout", ".", checkout);
  await git("-C", checkout, "checkout", "--quiet", "--detach", revision);
  await run(docker, [
    "build",
    "--quiet",
    "--build-arg",
    `SOURCE_REVISION=${revision}`,
    "-t",
    tag,
    checkout,
  ]);
  const imageId = await run(docker, [
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    tag,
  ]);
  images.push(imageId);
  const evidence = join(directory, `evidence-${label}.json`);
  await writeFile(
    evidence,
    JSON.stringify({
      sourceRevision: revision,
      imageDigest: imageId,
      passed: true,
      checks: [
        {
          name: "offline update rehearsal build (fixture key, not release acceptance)",
          passed: true,
        },
      ],
    }),
  );
  const pkg = join(directory, `package-${label}`);
  // Each revision packages itself with its own release tooling.
  await run(
    process.execPath,
    [
      "scripts/release-package.mjs",
      "create",
      "--directory",
      pkg,
      "--image",
      tag,
      "--version",
      `0.0.0-rehearsal.${label}`,
      "--evidence",
      evidence,
      "--signing-key",
      signingKey,
      "--public-key",
      trustedKey,
      ...(earlier ? ["--previous", earlier] : []),
    ],
    { cwd: checkout },
  );
  await run(docker, ["image", "rm", tag]);
  const { migrations } = JSON.parse(
    await readFile(join(pkg, "MIGRATIONS.json"), "utf8"),
  );
  return { pkg, revision, imageId, migrations };
}
async function internalOnly(project, file) {
  for (const service of ["app", "db"]) {
    const container = await compose(project, file, ["ps", "-q", service]);
    const networks = JSON.parse(
      await run(docker, [
        "inspect",
        "--format",
        "{{json .NetworkSettings.Networks}}",
        container,
      ]),
    );
    for (const network of Object.keys(networks))
      assert.equal(
        await run(docker, [
          "network",
          "inspect",
          "--format",
          "{{.Internal}}",
          network,
        ]),
        "true",
        `${project} ${service} has a route out through ${network}`,
      );
  }
}
const FIXTURE = "/app/server/reports/offline-update-fixture.txt";
async function snapshot(project, file) {
  const app = await compose(project, file, ["ps", "-q", "app"]);
  const rows = async (query) => (await sql(project, file, query)).split("\n");
  return {
    image: await run(docker, ["inspect", "--format", "{{.Image}}", app]),
    migrations: await rows(
      "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id",
    ),
    columns: await rows(
      "SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY 1",
    ),
    measurements: await sql(
      project,
      file,
      "SELECT count(*)||':'||sum(d.value) FROM opcua_data d JOIN machines m ON m.id=d.machine_id WHERE m.name='Offline update fixture' AND d.node_key='OfflineUpdateCount'",
    ),
    report: await run(docker, ["exec", app, "cat", FIXTURE]),
  };
}
const hashes = (pkg) => pkg.migrations.map((m) => m.sha256);
let passed = false;
try {
  const resolveRevision = (revision) =>
    run("git", ["rev-parse", "--verify", `${revision}^{commit}`]);
  const first = await buildPackage(
    "previous",
    await resolveRevision(previousRevision),
  );
  const second = await buildPackage(
    "next",
    await resolveRevision(nextRevision),
    first.revision,
  );
  assert.ok(
    second.migrations.length > first.migrations.length,
    "Choose an earlier PREVIOUS_REVISION: the rehearsal must apply new migrations",
  );
  for (const { pkg } of [first, second]) await verify(pkg);
  const sbom = JSON.parse(
    await readFile(join(second.pkg, "sbom.cdx.json"), "utf8"),
  );
  assert.equal(sbom.bomFormat, "CycloneDX");
  assert.ok(sbom.components.length > 100, "SBOM lists the locked dependencies");
  assert.match(
    await readFile(join(second.pkg, "DEPENDENCY-NOTICES.txt"), "utf8"),
    /^node_modules\/pg\t\S+\tMIT$/m,
  );
  const notes = await readFile(join(second.pkg, "RELEASE-NOTES.md"), "utf8");
  for (const { name } of second.migrations.slice(first.migrations.length))
    assert.ok(notes.includes(`- ${name}`), `Release notes list ${name}`);
  logs.push(
    `Signed packages from ${first.revision.slice(0, 8)} and ${second.revision.slice(0, 8)} verified with the trusted key: signature, every digest, CycloneDX SBOM, license inventory and ${second.migrations.length - first.migrations.length} new migrations in the notes`,
  );
  for (const imageId of images)
    await assert.rejects(
      run(docker, ["image", "inspect", imageId]),
      /No such image/i,
      "Another tag still holds the application image; the package must be its only source",
    );

  const install = join(directory, "install"),
    file = join(install, "compose.json");
  stacks.push({ project: source, file });
  await run(process.execPath, [
    join(first.pkg, "offline-package.mjs"),
    "install",
    "--directory",
    first.pkg,
    "--project",
    source,
    "--destination",
    install,
    "--port",
    String(await freePort()),
  ]);
  await internalOnly(source, file);
  await sql(
    source,
    file,
    "WITH m AS (INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Offline update fixture','opc.tcp://127.0.0.1:49989','127.0.0.1',false) RETURNING id) INSERT INTO opcua_data(machine_id,node_key,timestamp,received_at,value,status_code) SELECT m.id,'OfflineUpdateCount',t,t,n,'Good' FROM m, (SELECT n, timestamptz '2026-01-01T00:00:00Z'+n*interval '1 minute' AS t FROM generate_series(1,5) n) s",
  );
  await run(docker, [
    "exec",
    await compose(source, file, ["ps", "-q", "app"]),
    "sh",
    "-c",
    `printf 'offline update fixture' > ${FIXTURE}`,
  ]);
  const before = await snapshot(source, file);
  assert.equal(before.image, first.imageId);
  assert.deepEqual(before.migrations, hashes(first));
  assert.equal(before.measurements, "5:15");
  logs.push(
    "First package installed from its own images (absent locally beforehand); app and database have only internal networks",
  );

  // Every digest is checked: a changed SBOM, license inventory or image archive is refused.
  for (const name of [
    "sbom.cdx.json",
    "DEPENDENCY-NOTICES.txt",
    "images.tar",
  ]) {
    const path = join(second.pkg, name),
      { size } = await stat(path);
    await appendFile(path, "\n");
    await assert.rejects(verify(second.pkg), /integrity mismatch/i, name);
    if (name === "images.tar")
      await assert.rejects(
        run(process.execPath, [
          join(second.pkg, "offline-package.mjs"),
          "upgrade",
          "--directory",
          second.pkg,
          "--project",
          source,
          "--file",
          file,
          "--output",
          join(directory, "must-not-create"),
        ]),
        /Integrity mismatch: images\.tar/,
      );
    await truncate(path, size);
  }
  await verify(second.pkg);
  assert.equal((await snapshot(source, file)).image, first.imageId);
  logs.push(
    "Changed SBOM, license inventory and image archive are refused; a corrupted package never touches the installation",
  );

  // Fault: the new version never reports healthy. Its migrations may already have run.
  const failing = JSON.parse(await readFile(file, "utf8"));
  failing.services.app.healthcheck = {
    test: ["CMD", "node", "-e", "process.exit(1)"],
    interval: "1s",
    timeout: "5s",
    retries: 1,
    start_period: "1s",
  };
  failing.services.app.restart = "no";
  await writeFile(file, JSON.stringify(failing));
  const failedBackup = join(directory, "failed-upgrade-backup");
  const upgrade = (project, composeFile, output) =>
    run(process.execPath, [
      join(second.pkg, "offline-package.mjs"),
      "upgrade",
      "--directory",
      second.pkg,
      "--project",
      project,
      "--file",
      composeFile,
      "--output",
      output,
    ]);
  await assert.rejects(upgrade(source, file, failedBackup), /Upgrade failed/);
  assert.equal(
    await compose(source, file, ["ps", "--status", "running", "-q", "app"]),
    "",
  );
  const operate = (command, project, args) =>
    run(process.execPath, [
      join(second.pkg, "operate.mjs"),
      command,
      "--project",
      project,
      ...args,
    ]);
  await operate("verify", source, ["--backup", failedBackup]);
  assert.equal(
    JSON.parse(await readFile(join(failedBackup, "manifest.json"), "utf8"))
      .appImage,
    first.imageId,
  );
  const rollbackDirectory = join(directory, "rollback"),
    rollbackFile = join(rollbackDirectory, "compose.json"),
    port = await freePort();
  stacks.push({ project: rollback, file: rollbackFile });
  await operate("restore", rollback, [
    "--directory",
    rollbackDirectory,
    "--backup",
    failedBackup,
    "--port",
    String(port),
  ]);
  await internalOnly(rollback, rollbackFile);
  assert.deepEqual(await snapshot(rollback, rollbackFile), before);
  logs.push(
    "Failed upgrade stopped the app after a verified backup; rollback restored the previous image, migrations, measurements and files into a fresh project",
  );

  const upgradeBackup = join(directory, "upgrade-backup");
  await upgrade(rollback, rollbackFile, upgradeBackup);
  await operate("verify", rollback, ["--backup", upgradeBackup]);
  assert.equal(
    JSON.parse(await readFile(join(upgradeBackup, "manifest.json"), "utf8"))
      .appImage,
    first.imageId,
  );
  const after = await snapshot(rollback, rollbackFile);
  assert.equal(after.image, second.imageId);
  assert.deepEqual(after.migrations, hashes(second));
  assert.deepEqual(
    after.migrations.slice(0, before.migrations.length),
    before.migrations,
  );
  const columns = new Set(after.columns);
  assert.deepEqual(
    before.columns.filter((column) => !columns.has(column)),
    [],
  );
  assert.ok(after.columns.length > before.columns.length);
  assert.equal(after.measurements, before.measurements);
  assert.equal(after.report, before.report);
  await internalOnly(rollback, rollbackFile);
  const health = await fetch(`http://localhost:${port}/healthz`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).mode, "recovery");
  logs.push(
    `Upgrade from the second package alone: verified pre-upgrade backup, ${after.migrations.length - before.migrations.length} additive migrations (no column removed), measurements and report file preserved, healthy recovery preview without an internet route`,
  );
  await writeFile(
    join(directory, "validation.json"),
    JSON.stringify(
      {
        previous: {
          revision: first.revision,
          image: first.imageId,
          migrations: first.migrations.length,
        },
        next: {
          revision: second.revision,
          image: second.imageId,
          migrations: second.migrations.length,
        },
        checks: logs,
        at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  passed = true;
  console.log(logs.join("\n"));
  console.log(`Offline update evidence: ${join(directory, "validation.json")}`);
} finally {
  for (const owned of stacks.reverse()) {
    assert.ok(owned.project.startsWith(source));
    assert.equal(dirname(dirname(owned.file)), directory);
    await compose(owned.project, owned.file, ["down", "--volumes"]).catch(
      () => {},
    );
  }
  // Built by this run; an image another tag still uses is left alone.
  for (const imageId of images)
    await run(docker, ["image", "rm", imageId]).catch(() => {});
  // Packages, backups and sources are large and hold fixture secrets; keep them on failure.
  if (passed)
    for (const name of await readdir(directory))
      if (name !== "validation.json")
        await rm(join(directory, name), { recursive: true, force: true });
}
