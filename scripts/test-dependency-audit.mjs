import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkAudit } from "./check-dependency-audit.mjs";

const clean = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      total: 0,
    },
  },
};
assert.equal(checkAudit(clean).passed, true);
for (const severity of Object.keys(clean.metadata.vulnerabilities)) {
  const finding = structuredClone(clean);
  finding.metadata.vulnerabilities[severity] = 1;
  assert.throws(() => checkAudit(finding));
  delete finding.metadata.vulnerabilities[severity];
  assert.throws(() => checkAudit(finding));
}
const legacy = structuredClone(clean);
legacy.vulnerabilities.minimatch = {
  via: [{ url: "https://github.com/advisories/GHSA-g3hv-75wg-m249" }],
};
assert.throws(() => checkAudit(legacy));
for (const invalid of [
  null,
  {},
  { ...clean, error: { code: "network" } },
  { ...clean, auditReportVersion: 1 },
  { ...clean, vulnerabilities: [] },
]) {
  assert.throws(() => checkAudit(invalid));
}

const directory = await mkdtemp(join(tmpdir(), "dependency-audit-"));
try {
  const path = join(directory, "report.json");
  const script = fileURLToPath(
    new URL("./check-dependency-audit.mjs", import.meta.url),
  );
  for (const [report, passes] of [
    [JSON.stringify(clean), true],
    [JSON.stringify(legacy), false],
    ["{broken", false],
  ]) {
    await writeFile(path, report);
    const result = spawnSync(process.execPath, [script, path], {
      encoding: "utf8",
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status === 0, passes, result.stderr);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(
  "PASS: dependency audit accepts only complete zero-advisory reports, including through the CLI",
);
