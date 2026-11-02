import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, relative, sep, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";

const { values } = parseArgs({
  options: {
    directory: { type: "string" },
    hostname: { type: "string", default: "localhost" },
    "https-port": { type: "string", default: "8443" },
    "http-port": { type: "string", default: "8080" },
    image: { type: "string", default: "performance-dashboard:secure-local" },
    project: { type: "string", default: "performance-dashboard-secure" },
  },
});
assert(
  values.directory,
  "--directory must name a new private directory on encrypted storage",
);
assert.match(values.project, /^[a-z][a-z0-9-]{2,47}$/);
assert.match(values.hostname, /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i);
const httpsPort = Number(values["https-port"]),
  httpPort = Number(values["http-port"]);
for (const port of [httpsPort, httpPort])
  assert(Number.isInteger(port) && port > 1024 && port <= 65535);
assert.notEqual(httpPort, httpsPort);
const root = resolve(import.meta.dirname, ".."),
  directory = resolve(values.directory);
const repositoryPath = relative(root, directory);
assert(
  isAbsolute(repositoryPath) ||
    repositoryPath.startsWith(".." + sep) ||
    repositoryPath.startsWith(".local" + sep),
  "Keep deployment secrets outside the checkout or under its ignored .local directory",
);
await mkdir(directory, { mode: 0o700 });
const tls = join(directory, "tls");
await mkdir(tls, { mode: 0o700 });
const save = (path, value) =>
  writeFile(path, value, { mode: 0o600, flag: "wx" });
const secret = () => randomBytes(32).toString("hex");
const openssl =
  process.env.OPENSSL_BIN ||
  (process.platform === "win32" &&
  existsSync("C:/Program Files/Git/usr/bin/openssl.exe")
    ? "C:/Program Files/Git/usr/bin/openssl.exe"
    : "openssl");
const ssl = (...args) =>
  execFileSync(openssl, args, { cwd: tls, windowsHide: true, stdio: "pipe" });
ssl(
  "req",
  "-x509",
  "-newkey",
  "rsa:3072",
  "-nodes",
  "-days",
  "30",
  "-keyout",
  "ca.key",
  "-out",
  "ca.crt",
  "-subj",
  "/CN=Performance Dashboard local test CA",
  "-addext",
  "basicConstraints=critical,CA:TRUE",
  "-addext",
  "keyUsage=critical,keyCertSign,cRLSign",
);
for (const [name, host] of [
  ["proxy", values.hostname],
  ["database", "db"],
]) {
  ssl(
    "req",
    "-newkey",
    "rsa:3072",
    "-nodes",
    "-keyout",
    `${name}.key`,
    "-out",
    `${name}.csr`,
    "-subj",
    `/CN=${host}`,
  );
  await save(
    join(tls, `${name}.ext`),
    `subjectAltName=DNS:${host}\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`,
  );
  ssl(
    "x509",
    "-req",
    "-in",
    `${name}.csr`,
    "-CA",
    "ca.crt",
    "-CAkey",
    "ca.key",
    "-CAcreateserial",
    "-days",
    "30",
    "-out",
    `${name}.crt`,
    "-extfile",
    `${name}.ext`,
  );
}
const origin = `https://${values.hostname}:${httpsPort}`;
const config = YAML.parse(
  await readFile(join(root, "docker-compose.yml"), "utf8"),
);
config.name = values.project;
const app = config.services.app,
  db = config.services.db;
app.build = root;
app.image = values.image;
delete app.ports;
Object.assign(app.environment, {
  CLIENT_URL: origin,
  TRUSTED_PROXIES: "172.29.249.254",
  DB_PASSWORD: secret(),
  SESSION_SECRET: secret(),
  COOKIE_SECRET: secret(),
  SEED_ADMIN_PASSWORD: "",
  RECOVERY_MODE: "true",
  DB_SSL_CA_FILE: "/run/database-ca.crt",
});
app.volumes.push(`${join(tls, "ca.crt")}:/run/database-ca.crt:ro`);
app.security_opt = ["no-new-privileges:true"];
const initialPassword = secret();
config.services.setup = {
  image: app.image,
  build: root,
  profiles: ["setup"],
  command: [
    "sh",
    "-c",
    "node dist/src/database/migrate.js && node dist/src/database/seed.js",
  ],
  environment: { ...app.environment, SEED_ADMIN_PASSWORD: initialPassword },
  volumes: [`${join(tls, "ca.crt")}:/run/database-ca.crt:ro`],
  depends_on: { db: { condition: "service_healthy" } },
  security_opt: ["no-new-privileges:true"],
};
await save(
  join(directory, "initial-login.json"),
  JSON.stringify({ username: "admin", password: initialPassword }) + "\n",
);
Object.assign(db.environment, {
  POSTGRES_PASSWORD: secret(),
  APP_DB_PASSWORD: app.environment.DB_PASSWORD,
});
db.image = "performance-dashboard-postgres:secure-local";
db.build = { context: root, dockerfile: "deploy/postgres/Dockerfile" };
db.entrypoint = [
  "/bin/sh",
  "-ec",
  `mkdir -p /run/pg-tls; cp /run/tls-input/database.key /run/pg-tls/server.key; cp /run/tls-input/database.crt /run/pg-tls/server.crt; cp /run/pg_hba.conf /run/pg-tls/pg_hba.conf; chown -R postgres:postgres /run/pg-tls; chmod 600 /run/pg-tls/server.key /run/pg-tls/pg_hba.conf; exec docker-entrypoint.sh "$@"`,
  "--",
];
db.command = [
  "postgres",
  "-c",
  "ssl=on",
  "-c",
  "ssl_cert_file=/run/pg-tls/server.crt",
  "-c",
  "ssl_key_file=/run/pg-tls/server.key",
  "-c",
  "hba_file=/run/pg-tls/pg_hba.conf",
];
db.tmpfs = ["/run/pg-tls"];
db.volumes.push(
  `${join(tls, "database.key")}:/run/tls-input/database.key:ro`,
  `${join(tls, "database.crt")}:/run/tls-input/database.crt:ro`,
  `${join(directory, "pg_hba.conf")}:/run/pg_hba.conf:ro`,
);
await save(
  join(directory, "pg_hba.conf"),
  "local all all trust\nhostnossl all all all reject\nhostssl all all all scram-sha-256\n",
);
config.services.proxy = {
  image: "performance-dashboard-proxy:secure-local",
  build: { context: root, dockerfile: "deploy/proxy/Dockerfile" },
  ports: [`127.0.0.1:${httpPort}:8080`, `127.0.0.1:${httpsPort}:8443`],
  volumes: [
    `${join(directory, "nginx.conf")}:/etc/nginx/nginx.conf:ro`,
    `${join(tls, "proxy.key")}:/run/tls/server.key:ro`,
    `${join(tls, "proxy.crt")}:/run/tls/server.crt:ro`,
  ],
  networks: { default: { ipv4_address: "172.29.249.254" }, ingress: {} },
  depends_on: { app: { condition: "service_healthy" } },
  entrypoint: ["nginx", "-g", "daemon off;"],
  read_only: true,
  tmpfs: ["/var/cache/nginx", "/var/run", "/tmp"],
  security_opt: ["no-new-privileges:true"],
  restart: "unless-stopped",
};
config.networks = {
  default: {
    internal: true,
    ipam: { config: [{ subnet: "172.29.249.0/24" }] },
  },
  ingress: {},
};
const proxyHeaders = `proxy_pass http://app:3000;
      proxy_http_version 1.1;
      proxy_set_header Host $http_host;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-For $remote_addr;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;`;
await save(
  join(directory, "nginx.conf"),
  `user nginx;
worker_processes auto;
pid /var/run/nginx.pid;
events { worker_connections 1024; }
http {
  include /etc/nginx/mime.types;
  server_tokens off;
  access_log off;
  error_log /dev/stderr crit;
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;
  limit_req_zone $server_name zone=password_work:1m rate=5r/s;
  limit_conn_zone $binary_remote_addr zone=connections:10m;
  limit_req_status 429;
  limit_conn_status 429;
  server { listen 8080; return 308 ${origin}$request_uri; }
  server {
    listen 8443 ssl;
    server_name ${values.hostname};
    ssl_certificate /run/tls/server.crt;
    ssl_certificate_key /run/tls/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_tickets off;
    client_max_body_size 8m;
    client_body_timeout 15s;
    client_header_timeout 15s;
    limit_conn connections 32;
    add_header Strict-Transport-Security "max-age=31536000" always;
    location ~* ^/api/v1/auth/(login|change-password)/?$ {
      limit_req zone=login burst=5 nodelay;
      limit_req zone=password_work burst=10 nodelay;
      ${proxyHeaders}
    }
    location / { ${proxyHeaders} }
  }
}
`,
);
await save(
  join(directory, "compose.json"),
  JSON.stringify(config, null, 2) + "\n",
);
await save(join(directory, "backup.key"), randomBytes(32));
console.log(
  `Prepared ${join(directory, "compose.json")}. Local-only ports; recovery mode; 30-day test certificates. Trust tls/ca.crt only in the test client. Keep CA and backup private keys offline before any real deployment.`,
);
