import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { resolve, join } from "node:path";
import { io } from "socket.io-client";

const directory = resolve(
  process.argv[2] ?? ".local/security-checklist-20261102/secure-install",
);
const config = JSON.parse(
  await readFile(join(directory, "compose.json"), "utf8"),
);
const environment = config.services.app.environment,
  origin = new URL(environment.CLIENT_URL);
assert.equal(origin.hostname, "localhost");
assert.equal(environment.RECOVERY_MODE, "true");
assert.equal(config.services.app.ports, undefined);
assert.equal(config.services.db.ports, undefined);
assert(config.networks.default.internal);
const ca = await readFile(join(directory, "tls/ca.crt"));
const password = await readFile(join(directory, "seed-password"), "utf8");
let cookie = "";
function request(
  path,
  { method = "GET", body, headers = {}, trusted = true, secure = true } = {},
) {
  const port = secure
    ? origin.port
    : config.services.proxy.ports[0].split(":")[1];
  return new Promise((resolveDone, reject) => {
    const req = (secure ? https : http).request(
      {
        hostname: "localhost",
        port,
        path,
        method,
        ...(secure && trusted ? { ca } : {}),
        headers: {
          origin: origin.origin,
          cookie,
          ...headers,
          ...(body ? { "content-type": "application/json" } : {}),
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          if (res.headers["set-cookie"])
            cookie = res.headers["set-cookie"]
              .map((value) => value.split(";")[0])
              .join("; ");
          resolveDone({ status: res.statusCode, headers: res.headers, text });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(15_000, () =>
      req.destroy(new Error("HTTPS test timed out")),
    );
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const redirect = await request("/", { secure: false });
assert.equal(redirect.status, 308);
assert.equal(redirect.headers.location, origin.origin + "/");
await assert.rejects(request("/", { trusted: false }));
const csrf = await request("/api/v1/csrf-token");
assert.equal(csrf.status, 200);
for (const attribute of ["Secure", "HttpOnly", "SameSite=Lax"])
  assert(String(csrf.headers["set-cookie"]).includes(attribute));
assert.equal(csrf.headers["cache-control"], "no-store");
assert(csrf.headers["strict-transport-security"]);
const signedIn = await request("/api/v1/auth/login", {
  method: "POST",
  body: { username: "admin", password },
  headers: { "x-csrf-token": JSON.parse(csrf.text).csrfToken },
});
assert.equal(signedIn.status, 200, signedIn.text);
const me = await request("/api/v1/auth/me");
assert.equal(me.status, 200);
assert(!me.text.includes("passwordHash") && !me.text.includes("password_hash"));
const socket = io(origin.origin, {
  transports: ["websocket"],
  ca,
  rejectUnauthorized: true,
  extraHeaders: { Cookie: cookie, Origin: origin.origin },
  reconnection: false,
});
try {
  await once(socket, "connect", { signal: AbortSignal.timeout(15_000) });
} finally {
  socket.disconnect();
}
const fresh = await request("/api/v1/csrf-token");
assert.equal(
  (
    await request("/api/v1/auth/logout", {
      method: "POST",
      headers: { "x-csrf-token": JSON.parse(fresh.text).csrfToken },
    })
  ).status,
  200,
);
assert.equal((await request("/api/v1/auth/me")).status, 401);
const burst = await Promise.all(
  Array.from({ length: 20 }, () =>
    request("/api/v1/auth/login", { method: "POST", body: {} }),
  ),
);
assert(burst.some((response) => response.status === 429));
const dbTest = `import pg from 'pg'; import fs from 'node:fs';
const base={host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME};
const c=new pg.Client({...base,ssl:{ca:fs.readFileSync(process.env.DB_SSL_CA_FILE,'utf8'),rejectUnauthorized:true}});
await c.connect(); if(!(await c.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0]?.ssl)throw Error('Database TLS missing'); await c.end();
const plain=new pg.Client(base); let rejected=false; try{await plain.connect()}catch{rejected=true}finally{await plain.end()} if(!rejected)throw Error('Unencrypted database connection accepted');
console.log('PASS: database certificate verified; plaintext database access rejected');`;
const output = execFileSync(
  "docker",
  [
    "compose",
    "--project-name",
    config.name,
    "--file",
    join(directory, "compose.json"),
    "exec",
    "-T",
    "app",
    "node",
    "--input-type=module",
    "-e",
    dbTest,
  ],
  { encoding: "utf8", windowsHide: true },
);
console.log(output.trim());
console.log(
  "PASS: HTTP redirect, trusted/untrusted TLS, secure session and CSRF, sign-in/sign-out, authenticated WebSocket, private app/database ports and bot burst throttling",
);
