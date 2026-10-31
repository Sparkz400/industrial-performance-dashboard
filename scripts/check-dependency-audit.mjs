import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const advisory = "https://github.com/advisories/GHSA-g3hv-75wg-m249";
const legacyHash =
  "746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d";

// The advisory's <11 range includes v3, which has no optimizing preprocessor.
// shortcut: keep the callable v3 API until ESLint/React migrate; review this exception by 2026-12-01.
export function checkAudit(report, lock, sources, now = new Date()) {
  assert(
    !report.error && report.auditReportVersion === 2,
    "Invalid npm audit report",
  );
  const vulnerabilities = Object.entries(report.vulnerabilities);
  assert.equal(vulnerabilities.length, report.metadata.vulnerabilities.total);
  let reviewed = 0;
  for (const [name, finding] of vulnerabilities) {
    assert(finding.via.length, `Unexplained finding: ${name}`);
    for (const via of finding.via) {
      if (typeof via === "string") {
        assert(
          report.vulnerabilities[via],
          `Unknown dependency finding: ${via}`,
        );
        continue;
      }
      assert(
        name === "minimatch" && via.url === advisory,
        `Unreviewed advisory: ${via.url}`,
      );
      assert(
        now < new Date("2026-12-01T00:00:00Z"),
        "Legacy minimatch review expired",
      );
      assert(finding.nodes.length, "Missing affected package paths");
      for (const node of finding.nodes) {
        const pkg = lock.packages[node];
        assert(
          pkg?.version === "3.1.5" && pkg.dev === true,
          `Affected matcher is not development-only v3.1.5: ${node}`,
        );
        assert.equal(
          createHash("sha256").update(sources[node]).digest("hex"),
          legacyHash,
          "Legacy matcher source changed; reassess advisory",
        );
      }
      reviewed++;
    }
  }
  assert(!vulnerabilities.length || reviewed, "No reviewed root advisory");
  return {
    passed: true,
    rawAffectedPackages: vulnerabilities.length,
    reviewedNonApplicableAdvisories: reviewed,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = JSON.parse(await readFile(process.argv[2], "utf8"));
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const sources = {};
  for (const node of report.vulnerabilities?.minimatch?.nodes ?? []) {
    assert(
      node.startsWith("node_modules/") && !node.split("/").includes(".."),
      "Invalid package path",
    );
    sources[node] = await readFile(resolve(node, "minimatch.js"));
  }
  console.log(JSON.stringify(checkAudit(report, lock, sources)));
}
