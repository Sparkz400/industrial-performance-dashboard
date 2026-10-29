import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createServer } from "node:net";
import { once } from "node:events";
import { chromium } from "@playwright/test";

const image = process.argv[2];
const previousImage = process.argv[3] || image;
assert.ok(
  image,
  "Usage: node scripts/test-operations.mjs IMAGE [PREVIOUS_IMAGE]",
);
const id = randomUUID().replaceAll("-", "").slice(0, 12),
  source = `pd-ops-${id}`,
  restored = `${source}-restore`,
  rollback = `${source}-rollback`;
const directory = resolve(".local", `operations-${id}`);
await mkdir(dirname(directory), { recursive: true });
await mkdir(directory, { recursive: false });
const docker = process.env.DOCKER_BIN || "docker";
const stacks = [],
  logs = [];
let browser;
async function run(executable, args, input) {
  const child = spawn(executable, args, {
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "",
    errors = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  child.stdin.end(input);
  await new Promise((done, fail) => {
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0
        ? done()
        : fail(new Error(errors.slice(-2000) || output.slice(-2000))),
    );
  });
  return output.trim();
}
const operate = (command, project, args = []) =>
  run(process.execPath, [
    "scripts/operate.mjs",
    command,
    "--project",
    project,
    ...args,
  ]);
const compose = (project, file, args) =>
  run(docker, ["compose", "-p", project, "-f", file, ...args]);
async function freePort() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((r) => server.close(r));
  return port;
}
try {
  const first = join(directory, "source"),
    file = join(first, "compose.json"),
    sourcePort = await freePort();
  stacks.push({ project: source, file });
  await operate("install", source, [
    "--directory",
    first,
    "--port",
    String(sourcePort),
    "--image",
    previousImage,
  ]);
  logs.push(
    "Fresh install and database migrations reached healthy recovery preview",
  );
  // The application's database identity owns only its database.
  const leastPrivilege = async (project, composeFile) => {
    const role = await compose(project, composeFile, [
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "performance_dashboard",
      "-tAc",
      "SELECT rolsuper::text||rolcreatedb::text||rolcreaterole::text||rolreplication::text||(SELECT datdba=r.oid FROM pg_database WHERE datname='performance_dashboard')::text||pg_has_role('dashboard','pg_execute_server_program','MEMBER')::text FROM pg_roles r WHERE rolname='dashboard'",
    ]);
    assert.equal(role, "falsefalsefalsefalsetruefalse", project);
    await assert.rejects(
      compose(project, composeFile, [
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
        "-c",
        "COPY (SELECT 1) TO PROGRAM 'true'",
      ]),
    );
    logs.push(`${project}: application database role is a non-superuser owner`);
  };
  await leastPrivilege(source, file);
  const app = await compose(source, file, ["ps", "-q", "app"]);
  const fixture = `
    import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import db from './dist/src/database/db.js';
    import manager from './dist/src/database/dbConnection.js';
    import { machines, opcuaData, machineCredentials } from './dist/src/database/schema.js';
    import { machineRepository } from './dist/src/repositories/machineRepository.js';
    import { MeasurementSpool } from './dist/src/queue/measurementSpool.js';
    import { writeReportPdf } from './dist/src/services/reportPdf.js';
    const machine = await machineRepository.createMachine({ name:'Owned restore fixture', ip:'127.0.0.1', port:4842, endpointUrl:'opc.tcp://127.0.0.1:4842', resourcePath:'', securityMode:'SignAndEncrypt', securityPolicy:'Basic256Sha256', isActive:true }, {mode:'username', username:'reader', password:'owned-restore-fixture'});
    const spool = new MeasurementSpool(process.env.OPCUA_SPOOL_PATH);
    spool.enqueue({ key:'Count', value:7, timestamp:new Date('2026-01-01T00:00:00Z'), machineId:machine.id, dataType:'Int32', statusCode:'Good' });
    spool.close();
    mkdirSync('/app/server/data/gateway/pki', {recursive:true});
    writeFileSync('/app/server/data/gateway/config.json', JSON.stringify({name:'Owned backup fixture',enabled:false}));
    writeFileSync('/app/server/data/gateway/pki/owned-backup-fixture.txt', 'gateway identity fixture');
    await writeReportPdf(process.env.REPORTS_DIR+'/fixture.pdf', { title:'Restore fixture', generatedAt:new Date('2026-01-01'), period:'Owned fixture', sections:[{title:'Evidence', paragraphs:['Unknown remains unknown.']}] });
    // Reviewed retention scheduled before the backup: three old raw samples and a pending job.
    const admin = (await manager.pool.query("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")).rows[0].id;
    const old = (await manager.pool.query("INSERT INTO opcua_data(machine_id,node_key,timestamp,received_at,value,status_code) SELECT $1,'RetainedCount',t,t,n,'Good' FROM (SELECT n, now()-interval '30 days'+n*interval '1 minute' AS t FROM generate_series(1,3) n) s RETURNING id", [machine.id])).rows;
    await manager.pool.query("INSERT INTO retention_policies(machine_id,days) VALUES ($1,7)", [machine.id]);
    const previewId = crypto.randomUUID();
    await manager.pool.query("INSERT INTO retention_previews(id,machine_id,policy_version,cutoff,max_id,rows,created_by) VALUES ($1,$2,1,now()-interval '7 days',$3,3,$4)", [previewId, machine.id, Math.max(...old.map((r) => r.id)), admin]);
    // Copy timestamps in SQL: JavaScript dates would drop PostgreSQL's microseconds.
    await manager.pool.query("INSERT INTO retention_preview_rows(preview_id,measurement_id,timestamp) SELECT $1,id,timestamp FROM opcua_data WHERE machine_id=$2 AND node_key='RetainedCount'", [previewId, machine.id]);
    await manager.pool.query("INSERT INTO retention_schedules(machine_id,preview_id,confirm_rows,created_by,run_at) VALUES ($1,$2,3,$3,now()+interval '30 minutes')", [machine.id, previewId, admin]);
    console.log(JSON.stringify({machineId:machine.id, previewId, admin, pdf:createHash('sha256').update(readFileSync(process.env.REPORTS_DIR+'/fixture.pdf')).digest('hex'), key:createHash('sha256').update(readFileSync(process.env.MACHINE_SECRETS_KEY_FILE)).digest('hex')}));
    await manager.end();
  `;
  const receipt = JSON.parse(
    (
      await run(
        docker,
        ["exec", "-i", app, "node", "--input-type=module"],
        fixture,
      )
    )
      .split("\n")
      .at(-1),
  );
  const backup = join(directory, "backup");
  await operate("backup", source, ["--file", file, "--output", backup]);
  await operate("verify", source, ["--backup", backup]);
  // The reviewed deletion runs on the source after the backup was taken.
  const retained = `
    import assert from 'node:assert/strict';
    import manager from './dist/src/database/dbConnection.js';
    import { applyRetention } from './dist/src/services/historyRetention.js';
    const result = await applyRetention(${receipt.machineId}, ${JSON.stringify(receipt.previewId)}, 3, ${receipt.admin});
    assert.equal(result.deleted, 3);
    assert.equal((await manager.pool.query("SELECT count(*)::int AS n FROM opcua_data WHERE node_key='RetainedCount'")).rows[0].n, 0);
    await manager.end();
  `;
  await run(docker, ["exec", "-i", app, "node", "--input-type=module"], retained);
  logs.push("Reviewed retention removed three raw samples after the backup");
  const next = join(directory, "restored"),
    nextFile = join(next, "compose.json"),
    nextPort = await freePort();
  stacks.push({ project: restored, file: nextFile });
  await operate("restore", restored, [
    "--directory",
    next,
    "--backup",
    backup,
    "--port",
    String(nextPort),
  ]);
  await leastPrivilege(restored, nextFile);
  const nextApp = await compose(restored, nextFile, ["ps", "-q", "app"]);
  const verification = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { createHash } from 'node:crypto';
    import db from './dist/src/database/db.js';
    import manager from './dist/src/database/dbConnection.js';
    import { machineCredentials, machines } from './dist/src/database/schema.js';
    import { openMachineSecret } from './dist/src/services/machineIdentity.js';
    import { MeasurementSpool } from './dist/src/queue/measurementSpool.js';
    const [row] = await db.select().from(machineCredentials);
    assert.equal((await openMachineSecret(row.machineId,row.encryptedSecret)).password,'owned-restore-fixture');
    assert.equal((await db.select().from(machines))[0].status,'disconnected');
    const spool = new MeasurementSpool(process.env.OPCUA_SPOOL_PATH); assert.equal(spool.count(),1); spool.close();
    const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
    assert.equal(hash(process.env.REPORTS_DIR+'/fixture.pdf'),${JSON.stringify(receipt.pdf)});
    assert.equal(hash(process.env.MACHINE_SECRETS_KEY_FILE),${JSON.stringify(receipt.key)});
    assert.equal(JSON.parse(readFileSync('/app/server/data/gateway/config.json','utf8')).enabled,false);
    assert.equal(readFileSync('/app/server/data/gateway/pki/owned-backup-fixture.txt','utf8'),'gateway identity fixture');
    console.log('PASS: database, encrypted identity, original key, pending spool and PDF restored');
    await manager.end();
  `;
  logs.push(
    await run(
      docker,
      ["exec", "-i", nextApp, "node", "--input-type=module"],
      verification,
    ),
  );
  // Restoring the pre-retention backup recovers the raw rows and cannot resume the deletion.
  const recovered = `
    import assert from 'node:assert/strict';
    import manager from './dist/src/database/dbConnection.js';
    import { applyRetention, runRetentionSchedules } from './dist/src/services/historyRetention.js';
    const q = async (sql, args = []) => (await manager.pool.query(sql, args)).rows;
    const raw = async () => (await q("SELECT count(*)::int AS n FROM opcua_data WHERE node_key='RetainedCount'"))[0].n;
    assert.equal(await raw(), 3);
    assert.equal((await q("SELECT count(*)::int AS n FROM history_summaries WHERE node_key='RetainedCount'"))[0].n, 0, 'No summary may double-count restored raw rows');
    const [job] = await q("SELECT status,error FROM retention_schedules WHERE preview_id=$1", [${JSON.stringify(receipt.previewId)}]);
    assert.deepEqual(job, { status: 'cancelled', error: 'Cancelled by restore; review a new preview' });
    assert.equal((await q("SELECT count(*)::int AS n FROM retention_preview_rows"))[0].n, 0);
    await runRetentionSchedules();
    const replay = await applyRetention(${receipt.machineId}, ${JSON.stringify(receipt.previewId)}, 3, ${receipt.admin});
    assert.equal(replay.deleted, 0);
    assert.equal(await raw(), 3);
    console.log('PASS: pre-retention backup restores raw rows; pending and replayed deletions remove nothing');
    await manager.end();
  `;
  logs.push(
    await run(
      docker,
      ["exec", "-i", nextApp, "node", "--input-type=module"],
      recovered,
    ),
  );
  assert.equal(
    (await (await fetch(`http://localhost:${nextPort}/healthz`)).json()).mode,
    "recovery",
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const login = JSON.parse(
    await readFile(join(first, "initial-login.json"), "utf8"),
  );
  await page.goto(`http://localhost:${nextPort}/login`);
  await page.getByLabel("Username").fill(login.username);
  await page.getByLabel(/^password/i).fill(login.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.getByText(/Recovery preview: machine connections/).waitFor();
  const csrf = (
    await (
      await page.request.get(`http://localhost:${nextPort}/api/v1/csrf-token`)
    ).json()
  ).csrfToken;
  for (const path of [
    "/machines",
    "/reports/schedules/1/run-now",
    "/auth/change-password",
  ]) {
    assert.equal(
      (
        await page.request.post(`http://localhost:${nextPort}/api/v1${path}`, {
          data: {},
          headers: { "x-csrf-token": csrf },
        })
      ).status(),
      503,
    );
  }
  assert.equal(
    (
      await page.request.post(
        `http://localhost:${nextPort}/api/trpc/dashboard.save`,
        { data: {}, headers: { "x-csrf-token": csrf } },
      )
    ).status(),
    403,
  );
  await page.screenshot({
    path: join(directory, "recovery-preview.png"),
    fullPage: true,
  });
  logs.push(
    "Recovery login/browser banner and REST mutation denial passed; no machine auto-connect",
  );
  await compose(restored, nextFile, ["stop", "db"]);
  assert.equal(
    (await fetch(`http://localhost:${nextPort}/healthz`)).status,
    503,
  );
  await compose(restored, nextFile, ["up", "-d", "--wait", "db"]);
  assert.equal(
    (await fetch(`http://localhost:${nextPort}/healthz`)).status,
    200,
  );
  logs.push(
    "Readiness reports database outage and recovery separately from collector status",
  );
  await assert.rejects(
    operate("restore", restored, [
      "--directory",
      join(directory, "must-not-create"),
      "--backup",
      backup,
    ]),
    /already has/,
  );
  await writeFile(join(backup, "unexpected.txt"), "tampered");
  await assert.rejects(
    operate("verify", source, ["--backup", backup]),
    /incomplete or has changed/,
  );
  await rm(join(backup, "unexpected.txt"));
  logs.push("Existing-project overwrite and backup tampering refused");
  await operate("upgrade", source, [
    "--file",
    file,
    "--image",
    image,
    "--output",
    join(directory, "upgrade-backup"),
  ]);
  logs.push("Upgrade checkpoint/backup and health verification passed");
  const fastFailure = JSON.parse(await readFile(file, "utf8"));
  fastFailure.services.app.healthcheck = {
    ...fastFailure.services.app.healthcheck,
    interval: "1s",
    retries: 1,
    start_period: "1s",
  };
  fastFailure.services.app.restart = "no";
  await writeFile(file, JSON.stringify(fastFailure));
  const failedBackup = join(directory, "failed-upgrade-backup");
  await assert.rejects(
    operate("upgrade", source, [
      "--file",
      file,
      "--image",
      "postgres:16-alpine",
      "--output",
      failedBackup,
    ]),
    /Upgrade failed/,
  );
  assert.equal(
    await compose(source, file, ["ps", "--status", "running", "-q", "app"]),
    "",
  );
  const rollbackDirectory = join(directory, "rollback"),
    rollbackFile = join(rollbackDirectory, "compose.json");
  stacks.push({ project: rollback, file: rollbackFile });
  await operate("restore", rollback, [
    "--directory",
    rollbackDirectory,
    "--backup",
    failedBackup,
    "--port",
    String(await freePort()),
  ]);
  const rollbackApp = await compose(rollback, rollbackFile, [
    "ps",
    "-q",
    "app",
  ]);
  logs.push(
    await run(
      docker,
      ["exec", "-i", rollbackApp, "node", "--input-type=module"],
      verification,
    ),
  );
  logs.push(
    "Failed upgrade stops the app; fresh-instance rollback restores the original data and image",
  );
  await run(docker, [
    "cp",
    resolve("scripts/test-capacity.mjs"),
    `${rollbackApp}:/app/scripts/test-capacity.mjs`,
  ]);
  const capacityOutput = await run(docker, [
    "exec",
    "-e",
    "PD_OWNED_CAPACITY_TEST=true",
    rollbackApp,
    "node",
    "../scripts/test-capacity.mjs",
  ]);
  const capacity = JSON.parse(
    capacityOutput
      .split("\n")
      .find((line) => line.startsWith('{"format":"capacity-fixture-v1"')),
  );
  await writeFile(
    join(directory, "capacity.json"),
    JSON.stringify(capacity, null, 2),
  );
  logs.push(
    `Synthetic capacity: ${capacity.persisted} rows, 10 query clients, p95 ${capacity.queryP95Ms.toFixed(1)} ms; limits recorded in capacity.json`,
  );
  await operate("activate", restored, ["--file", nextFile]);
  assert.equal(
    (await (await fetch(`http://localhost:${nextPort}/healthz`)).json()).mode,
    "normal",
  );
  logs.push("Explicit activation changes recovery preview to normal operation");
  await writeFile(
    join(directory, "validation.json"),
    JSON.stringify(
      { image, previousImage, checks: logs, at: new Date().toISOString() },
      null,
      2,
    ),
  );
  console.log(logs.join("\n"));
  console.log(`Operations evidence: ${directory}`);
} finally {
  await browser?.close();
  for (const owned of stacks.reverse()) {
    assert.ok(
      [source, restored, rollback].includes(owned.project) &&
        owned.project.startsWith(`pd-ops-${id}`),
    );
    assert.equal(dirname(dirname(owned.file)), directory);
    try {
      const config = JSON.parse(await readFile(owned.file, "utf8"));
      assert.equal(config.name, owned.project);
      await compose(owned.project, owned.file, ["down", "--volumes"]);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}
