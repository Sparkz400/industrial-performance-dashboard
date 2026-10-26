import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const image = process.argv[2];
assert.ok(image, "Usage: node scripts/test-container.mjs IMAGE");
const network = `pd-test-${randomUUID()}`;
const password = randomUUID();
const containers = [];
const volume = `${network}-reports`;
let networkCreated = false;
let volumeCreated = false;
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || "Docker command failed");
  return result.stdout.trim();
}
try {
  docker(["network", "create", "--internal", network]);
  networkCreated = true;
  docker(["volume", "create", volume]);
  volumeCreated = true;
  const database = docker([
    "run",
    "-d",
    "--network",
    network,
    "--network-alias",
    "database",
    "--tmpfs",
    "/var/lib/postgresql/data",
    "-e",
    `POSTGRES_PASSWORD=${password}`,
    "-e",
    "POSTGRES_USER=dashboard",
    "-e",
    "POSTGRES_DB=dashboard",
    "postgres:16-alpine",
  ]);
  containers.push(database);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (
      spawnSync("docker", [
        "exec",
        database,
        "pg_isready",
        "-U",
        "dashboard",
        "-d",
        "dashboard",
      ]).status === 0
    ) {
      ready = true;
      break;
    }
    await delay(1000);
  }
  assert.ok(ready, "Owned test PostgreSQL did not start");
  const app = docker([
    "run",
    "-d",
    "--network",
    network,
    "--tmpfs",
    "/app/logs:uid=1000,gid=1000",
    "-v",
    `${volume}:/app/server/reports`,
    "-e",
    "DB_HOST=database",
    "-e",
    "DB_USER=dashboard",
    "-e",
    "DB_NAME=dashboard",
    "-e",
    `DB_PASSWORD=${password}`,
    "-e",
    `SESSION_SECRET=${randomUUID()}`,
    "-e",
    `COOKIE_SECRET=${randomUUID()}`,
    "-e",
    `SEED_ADMIN_PASSWORD=${password}`,
    "-e",
    "CLIENT_URL=http://localhost:3000",
    image,
  ]);
  containers.push(app);
  docker(
    ["exec", "-i", app, "node", "--input-type=module"],
    `
    import assert from 'node:assert/strict';
    import { setTimeout as delay } from 'node:timers/promises';
    import { execFileSync } from 'node:child_process';
    const base = 'http://localhost:3000';
    let home;
    for (let i = 0; i < 90; i++) {
      try { home = await fetch(base); if (home.ok) break; } catch {}
      await delay(1000);
    }
    assert.equal(home?.status, 200, 'Production app failed to start');
    assert.match(await home.text(), /<html/i);
    execFileSync('node', ['dist/src/database/seed.js']);
    const csrf = await fetch(base + '/api/v1/csrf-token');
    const cookie = csrf.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
    const { csrfToken } = await csrf.json();
    const login = await fetch(base + '/api/v1/auth/login', { method: 'POST',
      headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: JSON.stringify({ username: 'admin', password: process.env.SEED_ADMIN_PASSWORD }) });
    assert.equal(login.status, 200, 'Seeded admin must be able to sign in');
    const session = login.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
    const health = await fetch(base + '/api/v1/status/health', { headers: { cookie: session } });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).checks.database.status, 'ok');
    assert.equal(process.getuid(), 1000, 'Runtime must preserve the non-root volume owner');
    assert.equal(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin' }).resolvedOptions().timeZone, 'Europe/Berlin');
    const refreshed = await fetch(base + '/api/v1/csrf-token', { headers: { cookie: session } });
    const refreshedToken = (await refreshed.json()).csrfToken;
    const headers = { cookie: session, 'content-type': 'application/json', 'x-csrf-token': refreshedToken };
    const request = async (path, data, method = 'POST') => {
      const response = await fetch(base + '/api/v1/reports' + path, { method, headers, ...(data ? { body: JSON.stringify(data) } : {}) });
      assert.ok(response.ok, 'Report API ' + path + ': ' + response.status);
      return response.json();
    };
    const template = await request('/templates', { name: 'Container report', type: 'daily', templateConfig: { title: 'Prüfstand Δ', sections: [{ type: 'alerts' }] } });
    const schedule = await request('/schedules', { templateId: template.id, name: 'Container timer', cronExpression: '*/2 * * * * *', timezone: 'Europe/Berlin' });
    let completed;
    for (let attempt = 0; attempt < 100; attempt++) {
      const history = await request('/history?scheduleId=' + schedule.id, null, 'GET');
      completed = history.data.find(row => row.status === 'completed');
      if (completed) break;
      await delay(100);
    }
    assert.ok(completed, 'Container automatic report did not finish');
    await request('/schedules/' + schedule.id, { isActive: false }, 'PUT');
    const pdf = await fetch(base + '/api/v1/reports/history/' + completed.id + '/download', { headers });
    assert.equal(pdf.status, 200);
    const bytes = Buffer.from(await pdf.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    const { writeFile } = await import('node:fs/promises');
    const { createHash } = await import('node:crypto');
    await writeFile('reports/acceptance.json', JSON.stringify({ path: completed.filePath, sha256: createHash('sha256').update(bytes).digest('hex') }));
  `,
  );
  docker(["restart", app]);
  docker(
    ["exec", "-i", app, "node", "--input-type=module"],
    `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { createHash } from 'node:crypto';
    import { setTimeout as delay } from 'node:timers/promises';
    let ready = false;
    for (let i = 0; i < 90; i++) { try { if ((await fetch('http://localhost:3000')).ok) { ready = true; break; } } catch {} await delay(1000); }
    assert.ok(ready, 'App did not restart against existing database');
    const evidence = JSON.parse(await readFile('reports/acceptance.json'));
    assert.equal(createHash('sha256').update(await readFile(evidence.path)).digest('hex'), evidence.sha256, 'Report volume changed on restart');
  `,
  );
  // Run crash/replay/SQLITE_FULL tests in the actual runtime, against this run's private database.
  docker(
    ["exec", "-i", "-w", "/app", app, "node", "--input-type=module"],
    `
    import net from 'node:net';
    import { once } from 'node:events';
    const sockets = new Set();
    const proxy = net.createServer(client => {
      const upstream = net.connect(5432, 'database');
      sockets.add(client); sockets.add(upstream);
      client.on('error', () => upstream.destroy()); upstream.on('error', () => client.destroy());
      client.on('close', () => { sockets.delete(client); upstream.destroy(); });
      upstream.on('close', () => { sockets.delete(upstream); client.destroy(); });
      client.pipe(upstream); upstream.pipe(client);
    }).listen(55432, '127.0.0.1');
    await once(proxy, 'listening');
    process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '55432';
    try { await import('./scripts/test-recovery.mjs'); }
    finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => proxy.close(resolve)); }
  `,
  );
  console.log(
    "PASS: container migrations, login/session, health, non-root owner, timezone, automatic PDF/download, persisted report restart and durable crash/outage replay",
  );
} finally {
  // Only resources created in this run; the database lives in disposable tmpfs.
  for (const container of containers.reverse()) docker(["rm", "-f", container]);
  if (volumeCreated) docker(["volume", "rm", volume]);
  if (networkCreated) docker(["network", "rm", network]);
}
