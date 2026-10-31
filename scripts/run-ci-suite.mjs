import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { loadCiSuites } from "./ci-feedback.mjs";
import { safeFailure, writeReceipt } from "./endurance-harness.mjs";

export async function runCiSuite({ root, directory, shard, tests }) {
  await mkdir(directory, { recursive: true });
  const receipt = {
    format: "pd-ci-suite-run-v1",
    shard,
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    startedAt: new Date().toISOString(),
    status: "running",
    tests: tests.map((test) => ({ ...test, status: "not-run" })),
  };
  const save = () => writeReceipt(join(directory, "summary.json"), receipt);
  await save();
  for (const test of receipt.tests) {
    console.log(`Running ${test.script}`);
    const begun = performance.now();
    test.status = "running";
    await save();
    let output = "",
      truncated = false;
    const result = await new Promise((done) => {
      const child = spawn(process.execPath, [test.script, ...test.args], {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, ...test.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
          output += chunk;
          if (output.length > 128000) {
            truncated = true;
            output = output.slice(-128000);
          }
        });
      }
      child.once("error", (error) =>
        done({ code: null, signal: null, error: error.message }),
      );
      child.once("close", (code, signal) => done({ code, signal }));
    });
    // A truncated first line may have lost the secret's field name.
    if (truncated)
      output = output.includes("\n")
        ? output.slice(output.indexOf("\n") + 1)
        : "";
    const log = basename(test.script, ".mjs") + ".log";
    await writeFile(
      join(directory, log),
      safeFailure(output + (result.error ?? "")),
    );
    Object.assign(test, {
      status: result.code === 0 ? "passed" : "failed",
      exitCode: result.code,
      signal: result.signal,
      durationSeconds: (performance.now() - begun) / 1000,
      log,
      outputTruncated: truncated,
    });
    console.log(
      `${test.status.toUpperCase()} ${test.script} (${test.durationSeconds.toFixed(1)} s); log: ${join(directory, log)}`,
    );
    if (test.status === "failed") {
      // Do not interpret test output as GitHub workflow commands.
      const marker = "pd-test-output-" + randomUUID();
      if (process.env.GITHUB_ACTIONS) console.log(`::stop-commands::${marker}`);
      console.error(safeFailure(output).split("\n").slice(-100).join("\n"));
      if (process.env.GITHUB_ACTIONS) console.log(`::${marker}::`);
      receipt.status = "failed";
      break;
    }
    await save();
  }
  if (receipt.status === "running") {
    assert(receipt.tests.every((test) => test.status === "passed"));
    receipt.status = "passed";
  }
  receipt.completedAt = new Date().toISOString();
  await save();
  return receipt;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { manifest } = await loadCiSuites();
  const shard = process.argv[2];
  assert(
    process.argv.length === 3 && Object.hasOwn(manifest.shards, shard),
    "Usage: node scripts/run-ci-suite.mjs 1|2|3|4",
  );
  const root = resolve(import.meta.dirname, "..");
  const result = await runCiSuite({
    root,
    shard,
    tests: manifest.shards[shard],
    directory: join(root, ".local", "ci-feedback", `shard-${shard}`),
  });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const table = [
      `### Browser suite ${shard}: ${result.status}`,
      "",
      "| Regression | Result | Seconds |",
      "|---|---|---:|",
      ...result.tests.map(
        (test) =>
          `| ${basename(test.script)} | ${test.status} | ${test.durationSeconds?.toFixed(1) ?? "—"} |`,
      ),
      "",
      `Bounded logs with common credential fields redacted, and timings: browser-evidence-${shard} / .local/ci-feedback/shard-${shard}.`,
      "",
    ];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, table.join("\n"));
  }
  if (result.status !== "passed") process.exitCode = 1;
}
