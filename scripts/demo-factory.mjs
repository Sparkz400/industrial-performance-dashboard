import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  copyFile,
  stat,
} from "node:fs/promises";
import { resolve, join } from "node:path";

// Run the same owned simulator and browser workflows as acceptance, then publish only whitelisted media.
const startedAt = Date.now();
const directory = resolve(
  ".local",
  `factory-demo-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
await mkdir(directory, { recursive: true });
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const sourceDirty = !!execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
async function sourceFingerprint() {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .sort();
  const hash = createHash("sha256");
  for (const name of files) {
    hash.update(name + "\0");
    hash.update(
      createHash("sha256")
        .update(await readFile(name))
        .digest(),
    );
  }
  return hash.digest("hex");
}
const sourceSha256 = await sourceFingerprint();
const steps = [
  [
    "production",
    "Commission a synthetic machine, observe alarms, reconcile a one-minute shift and generate a report.",
    "scripts/test-production.mjs",
  ],
  [
    "setup",
    "Preview a setup import, demonstrate conflicts and safely roll it back.",
    "scripts/test-configuration-bundles.mjs",
  ],
  [
    "work-orders",
    "Review synthetic work orders, reject invalid rows and avoid duplicate imports.",
    "scripts/test-work-orders.mjs",
  ],
  [
    "diagnostics",
    "Inspect revised sampling, rejected signals, alarm floods and recorded threshold replay.",
    "scripts/test-operational-diagnostics.mjs",
  ],
  [
    "asset",
    "Select a synthetic component and inspect quality, history, alarms and maintenance.",
    "scripts/test-asset-overview.mjs",
  ],
];
const completed = [];
for (const [id, description, script] of steps) {
  console.log(`DEMO: ${description}`);
  await new Promise((done, fail) => {
    const child = spawn(process.execPath, [script], {
      windowsHide: true,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0
        ? done()
        : fail(
            new Error(
              `${id} scenario failed (${code}); no passing demo will be published`,
            ),
          ),
    );
  });
  completed.push({ id, description, passed: true });
}
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  revision,
  "Source revision changed during demo",
);
assert.equal(
  await sourceFingerprint(),
  sourceSha256,
  "Source files changed during demo",
);
const files = [];
for (const source of [".local/production-evidence", ".local/daily-evidence"]) {
  for (const name of await readdir(source)) {
    if (
      !/^(commissioning|shift-report|report-|setup-bundle-|work-order|connection-diagnostics-|alarm-review-|asset-).+\.png$/.test(
        name,
      ) &&
      !["commissioning.png", "shift-report.png"].includes(name)
    )
      continue;
    if ((await stat(join(source, name))).mtimeMs < startedAt) continue;
    const bytes = await readFile(join(source, name));
    await copyFile(join(source, name), join(directory, name));
    files.push({
      name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}
assert(files.length >= 3, "Expected rendered scenario evidence");
const manifest = {
  format: "synthetic-factory-demo-v1",
  revision,
  sourceDirty,
  sourceSha256,
  synthetic: true,
  physicalQualification: false,
  completed,
  expectedShift: {
    runningSeconds: 30,
    stopSeconds: 30,
    total: 15,
    good: 13,
    reject: 2,
    oee: 13 / 30,
  },
  files,
};
await writeFile(
  join(directory, "demo.json"),
  JSON.stringify(manifest, null, 2),
);
const pictures = await Promise.all(
  files.map(
    async (f) =>
      `<figure><img alt="Synthetic factory workflow: ${f.name}" src="data:image/png;base64,${(await readFile(join(directory, f.name))).toString("base64")}"><figcaption>${f.name}</figcaption></figure>`,
  ),
);
await writeFile(
  join(directory, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic factory walkthrough</title><style>body{font:17px system-ui;background:#142025;color:#ecf0ed;max-width:1100px;margin:auto;padding:28px;line-height:1.6}h1{font-size:2.2rem}aside{border-left:4px solid #f3aa62;padding:12px;background:#233239}figure{margin:24px 0}img{max-width:100%;height:auto;border:1px solid #68818b}code{overflow-wrap:anywhere}</style><h1>Synthetic factory walkthrough</h1><aside>All machines, events and measurements shown here are synthetic. Passing this demonstration does not qualify physical machines or production deployment.</aside><p>Source <code>${revision}</code>${sourceDirty ? " with local changes" : ""}.</p><ol>${completed.map((s) => `<li>${s.description}</li>`).join("")}</ol><h2>Known outcome</h2><p>The independent one-minute ledger contains 30 seconds running and 30 seconds stopped: 15 total parts, 13 good and 2 rejected. The reconciled OEE is 43.33%. Missing and bad-quality readings remain unknown. Replayed events do not create duplicate incidents.</p><p>Setup imports remain paused; work-order files only change the local application after review. No ERP or physical machine is contacted.</p>${pictures.join("")}</html>`,
);
console.log(
  JSON.stringify({
    passed: true,
    directory,
    walkthrough: join(directory, "index.html"),
    physicalQualification: false,
  }),
);
