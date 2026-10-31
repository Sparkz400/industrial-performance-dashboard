import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function checkAudit(report) {
  assert(
    report && !report.error && report.auditReportVersion === 2,
    "Invalid npm audit report",
  );
  assert(
    report.vulnerabilities &&
      typeof report.vulnerabilities === "object" &&
      !Array.isArray(report.vulnerabilities),
    "Missing vulnerability records",
  );
  assert.equal(
    Object.keys(report.vulnerabilities).length,
    0,
    "Dependency advisories must be resolved; no exceptions are accepted",
  );
  for (const severity of [
    "info",
    "low",
    "moderate",
    "high",
    "critical",
    "total",
  ]) {
    assert.equal(
      report.metadata?.vulnerabilities?.[severity],
      0,
      `Missing or nonzero advisory count: ${severity}`,
    );
  }
  return { passed: true, rawAffectedPackages: 0 };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = JSON.parse(await readFile(process.argv[2], "utf8"));
  console.log(JSON.stringify(checkAudit(report)));
}
