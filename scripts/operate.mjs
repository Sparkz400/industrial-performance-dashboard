import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, relative, isAbsolute, posix } from "node:path";
import { parseArgs } from "node:util";
import { pipeline } from "node:stream/promises";

const {
  values: options,
  positionals: [command],
} = parseArgs({
  allowPositionals: true,
  options: {
    project: { type: "string" },
    file: { type: "string" },
    directory: { type: "string" },
    backup: { type: "string" },
    output: { type: "string" },
    image: { type: "string" },
    "database-image": { type: "string" },
    port: { type: "string" },
  },
});
assert.ok(
  ["install", "backup", "restore", "upgrade", "activate", "verify"].includes(
    command,
  ),
  "Usage: node scripts/operate.mjs install|backup|restore|upgrade|activate|verify --project NAME [--file compose.json] [--directory NEW_DIR] [--backup BACKUP_DIR] [--output NEW_BACKUP_DIR] [--image IMAGE] [--port PORT]",
);
const project = options.project;
assert.match(
  project ?? "",
  /^[a-z][a-z0-9-]{2,47}$/,
  "Use an explicit, unique project name (3-48 lowercase letters/digits/hyphens)",
);
const lock = join(tmpdir(), `performance-dashboard-${project}.lock`);
closeSync(openSync(lock, "wx", 0o600));
process.on("exit", () => {
  unlinkSync(lock);
});
const port = Number(options.port ?? 3001);
assert.ok(
  Number.isInteger(port) && port > 1024 && port <= 65535,
  "Invalid loopback port",
);
const docker = process.env.DOCKER_BIN || "docker";
async function run(args, { inputFile, outputFile } = {}) {
  const child = spawn(docker, args, {
    windowsHide: true,
    stdio: [inputFile ? "pipe" : "ignore", "pipe", "pipe"],
  });
  let output = "",
    error = "";
  const completion = new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolveDone()
        : reject(
            new Error(
              `Docker ${args[0]} failed (${code}). ${error.slice(-1500)}`,
            ),
          ),
    );
  });
  child.stderr.on("data", (chunk) => {
    error = (error + chunk).slice(-3000);
  });
  const streams = [];
  if (outputFile)
    streams.push(
      pipeline(
        child.stdout,
        createWriteStream(outputFile, { flags: "wx", mode: 0o600 }),
      ),
    );
  else
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
  if (inputFile)
    streams.push(pipeline(createReadStream(inputFile), child.stdin));
  await Promise.all([completion, ...streams]);
  return output.trim();
}
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const save = async (file, value) =>
  writeFile(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
async function newDirectory(directory) {
  assert.ok(directory, "A new destination directory is required");
  const target = resolve(directory);
  await mkdir(dirname(target), { recursive: true });
  await mkdir(target, { mode: 0o700 }); // Existing destinations are never overwritten.
  return target;
}
const compose = (file, args, streams) =>
  run(["compose", "--project-name", project, "--file", file, ...args], streams);
async function unusedProject() {
  for (const kind of ["container", "volume", "network"]) {
    const found = await run([
      kind,
      "ls",
      ...(kind === "container" ? ["-a"] : []),
      "-q",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ]);
    assert.equal(
      found,
      "",
      `Project ${project} already has ${kind}s; choose a fresh name`,
    );
  }
}
const secret = () => randomBytes(32).toString("hex");
// Runs once on an empty volume. "$$" stops Compose interpolation; psql quotes the password.
const APP_ROLE_INIT = `set -eu
psql -v ON_ERROR_STOP=1 -v pw="$$APP_DB_PASSWORD" --username "$$POSTGRES_USER" --dbname "$$POSTGRES_DB" <<'SQL'
CREATE ROLE dashboard LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';
ALTER DATABASE performance_dashboard OWNER TO dashboard;
REVOKE ALL ON DATABASE performance_dashboard FROM PUBLIC;
SQL
`;
/** The application role owns only its database; the bootstrap superuser is never used by the app. */
function stack(image, environment, databaseImage = "postgres:16-alpine") {
  const appEnvironment = {
    ...environment,
    NODE_ENV: "production",
    HOST: "0.0.0.0",
    PORT: "3000",
    DB_HOST: "db",
    DB_PORT: "5432",
    DB_USER: "dashboard",
    DB_NAME: "performance_dashboard",
    OPCUA_PKI_DIR: "/app/server/certificates",
    OPCUA_SPOOL_PATH: "/app/server/data/measurements.sqlite",
    MACHINE_SECRETS_KEY_FILE: "/app/server/data/machine-secrets.key",
    REPORTS_DIR: "/app/server/reports",
    CLIENT_URL: `http://localhost:${port}`,
    RECOVERY_MODE: "true",
    SEED_ADMIN_PASSWORD: "",
  };
  return {
    name: project,
    services: {
      app: {
        image,
        environment: appEnvironment,
        volumes: [
          "measurements:/app/server/data",
          "certificates:/app/server/certificates",
          "reports:/app/server/reports",
        ],
        depends_on: { db: { condition: "service_healthy" } },
        restart: "unless-stopped",
        healthcheck: {
          test: [
            "CMD",
            "node",
            "-e",
            'fetch("http://127.0.0.1:3000/healthz").then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))',
          ],
          interval: "5s",
          timeout: "5s",
          retries: 20,
          start_period: "20s",
        },
      },
      preview: {
        image,
        entrypoint: [
          "node",
          "--input-type=module",
          "-e",
          `
      import http from 'node:http'; import net from 'node:net';
      const server = http.createServer((req,res)=>{
        const upstream=http.request({hostname:'app',port:3000,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});
        upstream.on('error',()=>{res.writeHead(502);res.end('Recovery preview unavailable')});
        req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
      });
      server.on('upgrade',(req,socket,head)=>{
        const upstream=net.connect(3000,'app',()=>{
          upstream.write(req.method+' '+req.url+' HTTP/1.1\\r\\n'+Object.entries(req.headers).map(([key,value])=>key+': '+value).join('\\r\\n')+'\\r\\n\\r\\n');
          upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
        });
        upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
      });
      server.listen(3000,'0.0.0.0');
    `,
        ],
        ports: [`127.0.0.1:${port}:3000`],
        networks: ["default", "preview"],
        read_only: true,
        cap_drop: ["ALL"],
        security_opt: ["no-new-privileges:true"],
        depends_on: { app: { condition: "service_healthy" } },
        restart: "unless-stopped",
      },
      db: {
        image: databaseImage,
        environment: {
          POSTGRES_USER: "postgres",
          POSTGRES_DB: "performance_dashboard",
          POSTGRES_PASSWORD: secret(),
          APP_DB_PASSWORD: environment.DB_PASSWORD,
        },
        configs: [
          {
            source: "app-role",
            target: "/docker-entrypoint-initdb.d/10-app-role.sh",
          },
        ],
        volumes: ["postgres_data:/var/lib/postgresql/data"],
        restart: "unless-stopped",
        healthcheck: {
          test: [
            "CMD-SHELL",
            "pg_isready -U dashboard -d performance_dashboard",
          ],
          interval: "5s",
          timeout: "5s",
          retries: 20,
        },
      },
    },
    volumes: {
      postgres_data: {},
      measurements: {},
      certificates: {},
      reports: {},
    },
    networks: { default: { internal: true }, preview: {} },
    configs: { "app-role": { content: APP_ROLE_INIT } },
  };
}
async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function files(directory, root = directory) {
  const result = {};
  for (const name of await readdir(directory)) {
    const file = join(directory, name),
      info = await lstat(file);
    assert.ok(!info.isSymbolicLink(), "Backups cannot contain symbolic links");
    if (info.isDirectory()) Object.assign(result, await files(file, root));
    else {
      assert.ok(info.isFile(), "Backup contains a non-regular file");
      if (file !== join(root, "manifest.json"))
        result[relative(root, file).replaceAll("\\", "/")] =
          await hashFile(file);
    }
  }
  return result;
}
async function verifyBackup(directory) {
  const root = resolve(directory),
    manifest = await json(join(root, "manifest.json"));
  assert.equal(manifest.format, "performance-dashboard-backup-v1");
  for (const name of Object.keys(manifest.files)) {
    assert.ok(
      !isAbsolute(name) && !name.split(/[\\/]/).includes(".."),
      "Unsafe manifest path",
    );
  }
  const actual = await files(root);
  if (
    Object.keys(actual).length !== Object.keys(manifest.files).length ||
    Object.entries(actual).some(([name, hash]) => manifest.files[name] !== hash)
  ) {
    throw new Error("Backup is incomplete or has changed");
  }
  for (const required of [
    "database.dump",
    "images.tar",
    "runtime.json",
    "compose.json",
  ])
    assert.ok(manifest.files[required], `Missing ${required}`);
  return manifest;
}
async function backupStack(file, destination, resume = true) {
  const directory = await newDirectory(destination);
  const ids = {};
  for (const service of ["app", "db"]) {
    const id = await compose(file, ["ps", "-a", "-q", service]);
    assert.match(
      id,
      /^[a-f0-9]{12,64}$/,
      `Expected exactly one ${service} container`,
    );
    const [container] = JSON.parse(await run(["inspect", id]));
    assert.equal(
      container.Config.Labels["com.docker.compose.project"],
      project,
    );
    ids[service] = container;
  }
  assert.ok(
    ids.db.State.Running,
    "Database must be running for a consistent logical dump",
  );
  const appEnvironment = Object.fromEntries(
    ids.app.Config.Env.map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1),
    ]),
  );
  assert.equal(appEnvironment.DB_HOST, "db");
  assert.equal(appEnvironment.DB_NAME, "performance_dashboard");
  assert.equal(appEnvironment.DB_USER, "dashboard");
  assert.ok(
    appEnvironment.OPCUA_PKI_DIR,
    "Set OPCUA_PKI_DIR explicitly and migrate existing certificates into its persistent volume before backup",
  );
  for (const [variable, fallback, root] of [
    ["OPCUA_SPOOL_PATH", "data/measurements.sqlite", "/app/server/data/"],
    [
      "MACHINE_SECRETS_KEY_FILE",
      "data/machine-secrets.key",
      "/app/server/data/",
    ],
    ["OPCUA_PKI_DIR", "certificates", "/app/server/certificates/"],
    ["REPORTS_DIR", "reports", "/app/server/reports/"],
  ])
    assert.ok(
      (
        posix.resolve("/app/server", appEnvironment[variable] || fallback) + "/"
      ).startsWith(root),
      `${variable} is outside the backed-up volumes`,
    );
  const paths = ["data", "certificates", "reports"];
  for (const folder of paths)
    assert.ok(
      ids.app.Mounts.some(
        (mount) =>
          mount.Destination === `/app/server/${folder}` &&
          mount.Type === "volume",
      ),
      `Expected persistent ${folder} volume`,
    );
  await compose(file, ["stop", "--timeout", "60", "app"]);
  let complete = false;
  try {
    await compose(
      file,
      [
        "exec",
        "-T",
        "db",
        "pg_dump",
        "-U",
        "dashboard",
        "-d",
        "performance_dashboard",
        "-Fc",
      ],
      { outputFile: join(directory, "database.dump") },
    );
    for (const folder of paths)
      await run([
        "cp",
        `${ids.app.Id}:/app/server/${folder}`,
        join(directory, folder),
      ]);
    await run(["image", "save", ids.app.Image, ids.db.Image], {
      outputFile: join(directory, "images.tar"),
    });
    await copyFile(file, join(directory, "compose.json"));
    await chmod(join(directory, "compose.json"), 0o600);
    await save(join(directory, "runtime.json"), {
      app: appEnvironment,
      database: Object.fromEntries(
        ids.db.Config.Env.filter((line) => line.startsWith("POSTGRES_")).map(
          (line) => [
            line.slice(0, line.indexOf("=")),
            line.slice(line.indexOf("=") + 1),
          ],
        ),
      ),
    });
    await save(join(directory, "manifest.json"), {
      format: "performance-dashboard-backup-v1",
      createdAt: new Date().toISOString(),
      project,
      appImage: ids.app.Image,
      databaseImage: ids.db.Image,
      files: await files(directory),
    });
    await verifyBackup(directory);
    complete = true;
    console.log(`Verified backup: ${directory}`);
    return directory;
  } finally {
    if (ids.app.State.Running && (resume || !complete))
      await compose(file, ["start", "app"]);
  }
}

if (command === "verify") {
  await verifyBackup(options.backup);
  console.log(
    "Backup files and checksums verified; this is not a restore test.",
  );
} else if (command === "install" || command === "restore") {
  await unusedProject();
  const directory = await newDirectory(options.directory),
    file = join(directory, "compose.json");
  let config;
  if (command === "restore") {
    assert.ok(options.backup, "--backup is required");
    const backup = resolve(options.backup),
      manifest = await verifyBackup(backup),
      runtime = await json(join(backup, "runtime.json"));
    await run(["image", "load"], { inputFile: join(backup, "images.tar") });
    // Older backups ran the app as the database superuser; restores adopt the reduced role.
    config = stack(
      options.image || manifest.appImage,
      runtime.app,
      manifest.databaseImage,
    );
    await save(file, config);
    await compose(file, ["up", "-d", "--wait", "db"]);
    await compose(
      file,
      [
        "exec",
        "-T",
        "db",
        "pg_restore",
        "-U",
        "dashboard",
        "-d",
        "performance_dashboard",
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
      ],
      { inputFile: join(backup, "database.dump") },
    );
    // A restore recovers data; deletions reviewed before the backup must not resume afterwards.
    await compose(file, [
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
      `DO $$ BEGIN
        IF to_regclass('public.retention_schedules') IS NOT NULL THEN
          UPDATE retention_schedules SET status='cancelled', error='Cancelled by restore; review a new preview' WHERE status='scheduled';
        END IF;
        IF to_regclass('public.retention_preview_rows') IS NOT NULL THEN
          DELETE FROM retention_preview_rows;
        END IF;
      END $$;`,
    ]);
    await compose(file, ["create", "app"]);
    const app = await compose(file, ["ps", "-a", "-q", "app"]);
    for (const folder of ["data", "certificates", "reports"])
      await run([
        "cp",
        join(backup, folder) + "/.",
        `${app}:/app/server/${folder}/`,
      ]);
    await run([
      "run",
      "--rm",
      "--network",
      "none",
      "--volumes-from",
      app,
      "--user",
      "0",
      "--entrypoint",
      "sh",
      config.services.app.image,
      "-c",
      "chown -R 1000:1000 /app/server/data /app/server/certificates /app/server/reports",
    ]);
  } else {
    assert.ok(
      options.image,
      "--image is required (build or select a validated image first)",
    );
    const initialPassword = secret();
    config = stack(
      options.image,
      {
        DB_PASSWORD: secret(),
        SESSION_SECRET: secret(),
        COOKIE_SECRET: secret(),
        OPCUA_IP: "127.0.0.1",
        OPCUA_PORT: "4841",
      },
      options["database-image"] || "postgres:16-alpine",
    );
    config.services.app.environment.SEED_ADMIN_PASSWORD = initialPassword;
    await save(file, config);
    await save(join(directory, "initial-login.json"), {
      username: "admin",
      password: initialPassword,
    });
    await compose(file, ["up", "-d", "--wait", "db"]);
    await compose(file, [
      "run",
      "--rm",
      "--no-deps",
      "app",
      "sh",
      "-c",
      "node dist/src/database/migrate.js && node dist/src/database/seed.js",
    ]);
    config.services.app.environment.SEED_ADMIN_PASSWORD = "";
    await save(file, config);
  }
  await compose(file, ["up", "-d", "--wait", "app", "preview"]);
  await save(join(directory, "receipt.json"), {
    action: command,
    project,
    image: config.services.app.image,
    at: new Date().toISOString(),
    mode: "isolated-recovery",
    source: options.backup ? resolve(options.backup) : null,
  });
  console.log(
    `Isolated recovery preview: http://localhost:${port}. Configuration: ${file}. Review it before activate. Private login/configuration files must be protected with OS access controls.`,
  );
} else {
  assert.ok(options.file, "--file must name this installation's compose.json");
  const file = resolve(options.file),
    config = await json(file);
  assert.equal(
    config.name,
    project,
    "Configuration belongs to another project",
  );
  if (command === "backup") await backupStack(file, options.output);
  if (command === "upgrade") {
    assert.ok(
      options.image && options.output,
      "Upgrade requires --image and a new --output backup directory",
    );
    await run(["image", "inspect", options.image]);
    await backupStack(file, options.output, false);
    config.services.app.image = options.image;
    await save(file + ".next", config);
    await rename(file + ".next", file);
    try {
      await compose(file, ["up", "-d", "--wait", "--no-deps", "app"]);
    } catch (error) {
      await compose(file, ["stop", "app"]);
      throw new Error(
        `Upgrade failed; app stopped and data retained. Restore ${resolve(options.output)} into a fresh project for rollback. ${error.message}`,
      );
    }
    console.log(
      "Upgrade is healthy. The verified pre-upgrade backup remains available for a fresh-instance rollback.",
    );
  }
  if (command === "activate") {
    assert.equal(
      config.services.app.environment.RECOVERY_MODE,
      "true",
      "Installation is already active",
    );
    await compose(file, ["stop", "app", "db"]);
    await compose(file, ["down"]); // Named volumes remain intact; never use --volumes here.
    config.services.app.environment.RECOVERY_MODE = "false";
    config.networks.default.internal = false;
    config.services.app.ports = config.services.preview.ports;
    delete config.services.preview;
    delete config.networks.preview;
    await save(file, config);
    await compose(file, ["up", "-d", "--wait"]);
    console.log(
      "Activated: configured machine connections, schedules and delivery workers may now run. Keep only one active collector for this installation.",
    );
  }
}
