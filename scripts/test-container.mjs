import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const image = process.argv[2];
assert.ok(image, 'Usage: node scripts/test-container.mjs IMAGE');
const network = `pd-test-${randomUUID()}`;
const password = randomUUID();
const containers = [];
let networkCreated = false;
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr || 'Docker command failed');
  return result.stdout.trim();
}
try {
  docker(['network', 'create', '--internal', network]);
  networkCreated = true;
  const database = docker(['run', '-d', '--network', network, '--network-alias', 'database',
    '--tmpfs', '/var/lib/postgresql/data', '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', 'POSTGRES_USER=dashboard', '-e', 'POSTGRES_DB=dashboard', 'postgres:16-alpine']);
  containers.push(database);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnSync('docker', ['exec', database, 'pg_isready', '-U', 'dashboard', '-d', 'dashboard']).status === 0) {
      ready = true;
      break;
    }
    await delay(1000);
  }
  assert.ok(ready, 'Owned test PostgreSQL did not start');
  const app = docker(['run', '-d', '--network', network,
    '-e', 'DB_HOST=database', '-e', 'DB_USER=dashboard', '-e', 'DB_NAME=dashboard',
    '-e', `DB_PASSWORD=${password}`, '-e', `SESSION_SECRET=${randomUUID()}`,
    '-e', `COOKIE_SECRET=${randomUUID()}`, '-e', `SEED_ADMIN_PASSWORD=${password}`,
    '-e', 'CLIENT_URL=http://localhost:3000', image]);
  containers.push(app);
  docker(['exec', '-i', app, 'node', '--input-type=module'], `
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
  `);
  console.log('PASS: isolated container migrations, seed, frontend, login/session, PostgreSQL health, non-root owner and timezone');
} finally {
  // Only resources created in this run; the database lives in disposable tmpfs.
  for (const container of containers.reverse()) docker(['rm', '-f', container]);
  if (networkCreated) docker(['network', 'rm', network]);
}
