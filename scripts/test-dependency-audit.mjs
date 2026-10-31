import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkAudit } from "./check-dependency-audit.mjs";

const node = "node_modules/minimatch";
const sources = { [node]: await readFile(`${node}/minimatch.js`) };
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const report = {
  auditReportVersion: 2,
  metadata: { vulnerabilities: { total: 2 } },
  vulnerabilities: {
    minimatch: {
      nodes: [node],
      via: [{ url: "https://github.com/advisories/GHSA-g3hv-75wg-m249" }],
    },
    eslint: { via: ["minimatch"] },
  },
};
const check = (
  r = report,
  l = lock,
  s = sources,
  date = new Date("2026-10-31"),
) => checkAudit(r, l, s, date);
assert.equal(check().passed, true);
assert.throws(() =>
  check(report, { packages: { [node]: { version: "10.2.6", dev: true } } }),
);
assert.throws(() =>
  check(report, { packages: { [node]: { version: "3.1.5", dev: false } } }),
);
assert.throws(() => check(report, lock, { [node]: "changed" }));
assert.throws(() => check(report, lock, sources, new Date("2026-12-01")));
const novel = structuredClone(report);
novel.vulnerabilities.minimatch.via.push({
  url: "https://github.com/advisories/new",
});
assert.throws(() => check(novel));
assert.throws(() => check({ ...report, error: { code: "network" } }));
console.log(
  "PASS: audit review rejects new advisories, changed sources, runtime copies, modern vulnerable versions and expired review",
);
