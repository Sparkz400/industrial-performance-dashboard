import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

// P04: evidence.json for release-package.mjs. It joins the CI results GitHub recorded
// for this exact revision with the container and operations suites run against the
// exact candidate image (CI tests its own build, whose digest differs).
//   node scripts/release-evidence.mjs --image performance-dashboard:candidate \
//     --previous-image performance-dashboard:1.0.0 --out .local/release-evidence.json
const { values: o } = parseArgs({
  options: {
    image: { type: "string" },
    "previous-image": { type: "string" },
    out: { type: "string" },
  },
});
assert(o.image && o.out, "Use --image IMAGE --out FILE [--previous-image IMAGE]");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
assert.equal(git("status", "--porcelain"), "", "Collect evidence from a clean checkout");
const revision = git("rev-parse", "HEAD");
const image = JSON.parse(
  execFileSync(process.env.DOCKER_BIN || "docker", ["image", "inspect", o.image], {
    encoding: "utf8",
  }),
)[0];
assert.equal(
  image.Config.Labels?.["org.opencontainers.image.revision"],
  revision,
  "Build the image with --build-arg SOURCE_REVISION=<this commit>",
);

const repo = execFileSync(
  "gh",
  ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
  { encoding: "utf8" },
).trim();
const runs = JSON.parse(
  execFileSync(
    "gh",
    ["api", `repos/${repo}/commits/${revision}/check-runs?per_page=100`],
    { encoding: "utf8" },
  ),
).check_runs;
assert(runs.length, "GitHub has no checks for this revision; push it and wait for CI");
const ran = runs.filter((run) => !["skipped", "neutral"].includes(run.conclusion));
const checks = ran.map((run) => ({
  name: `ci: ${run.name}`,
  passed: run.conclusion === "success",
  conclusion: run.conclusion ?? run.status,
  url: run.html_url,
}));

for (const [name, args] of [
  ["container", ["scripts/test-container.mjs", o.image]],
  [
    "operations (install, backup, upgrade, rollback, restore)",
    ["scripts/test-operations.mjs", o.image, o["previous-image"] ?? o.image],
  ],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  checks.push({ name: `image: ${name}`, passed: result.status === 0 });
}

const evidence = {
  sourceRevision: revision,
  imageDigest: image.Id,
  passed: checks.length > 0 && checks.every((check) => check.passed),
  checks,
  skipped: runs.filter((run) => !ran.includes(run)).map((run) => run.name),
  collectedAt: new Date().toISOString(),
};
await writeFile(o.out, JSON.stringify(evidence, null, 2));
console.log(
  JSON.stringify({ passed: evidence.passed, checks: checks.length, out: o.out }),
);
process.exit(evidence.passed ? 0 : 1);
