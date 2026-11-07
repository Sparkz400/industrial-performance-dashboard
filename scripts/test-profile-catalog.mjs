// Owned replays for the Boolean-state and 16-bit rollover catalog profiles (#18, #19)
// and catalog path containment with real files and directory links (#16).
// No database or network: deliveries pass the real spool normalization and shift calculation.
import assert from "node:assert/strict";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { dashboardResult } from "./correctness-adapter.mjs";
import { validateCatalog } from "./profile-catalog.mjs";

const catalog = JSON.parse(await readFile("profiles/catalog.json", "utf8"));
const checked = await validateCatalog(catalog);
const byId = Object.fromEntries(checked.map((entry) => [entry.id, entry]));

const at = (second) =>
  new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString();
let sequence = 0;
const delivery = (signal, second, value, quality = "Good") => ({
  id: `${signal}-${sequence++}`,
  signal,
  at: at(second),
  value: quality === "Good" ? value : null,
  quality,
});
const shift = (profile, deliveries, evidence = null) =>
  dashboardResult({
    start: at(0),
    end: at(60),
    asOf: at(60),
    timezone: "UTC",
    profile: JSON.parse(JSON.stringify(profile)),
    breaks: [],
    reasons: [],
    manualStates: [],
    declaration: null,
    evidence,
    deliveries,
  });

// #18 Boolean running state. Independently specified for a 60 s shift, 20 s max gap:
// true 0-20 s running; false from 20 s, last sample at 30 s goes stale after 50 s;
// BadNoCommunication at 55 s keeps 50-60 s unknown. A single Boolean never yields
// fault or planned time.
{
  const boolean = byId["owned-boolean-state"];
  assert.equal(boolean.qualification.level, "simulator");
  assert.equal(boolean.mapping.signals.state.dataType, "Boolean");
  assert.deepEqual(boolean.mapping.states, {
    running: [1],
    idle: [0],
    fault: [],
    planned: [],
  });
  const result = shift(boolean.mapping, [
    delivery("state", 0, true),
    delivery("state", 10, true),
    delivery("state", 20, false),
    delivery("state", 30, false),
    delivery("state", 55, null, "BadNoCommunication"),
  ]);
  assert.deepEqual(result.seconds, {
    running: 20,
    idle: 30,
    fault: 0,
    planned: 0,
    unknown: 10,
  });
  assert.equal(result.observedSeconds, 50);
  assert.deepEqual(result.quantities, {
    total: null,
    good: null,
    reject: null,
  });
  assert.equal(result.oee.overall, null, "No counters: OEE stays unknown");
  assert.equal(result.verified, false);
}

// #19 16-bit rollover. Total and good cross 65530 -> 4 (modulus 65536), rejects stay 0:
// 10 total, 10 good, 0 rejects; 60 s running at a 2 s ideal cycle is performance 10/30.
{
  const rollover = byId["owned-rollover"];
  assert.equal(rollover.qualification.level, "simulator");
  assert.equal(rollover.mapping.counterPolicy, "rollover");
  assert.equal(rollover.mapping.counterModulus, 65536);
  const counters = [
    [0, 65530],
    [15, 65533],
    [30, 65535],
    [45, 1],
    [60, 4],
  ];
  const replay = (badTotalAt) => [
    ...counters.map(([second]) => delivery("state", second, 1)),
    ...counters.map(([second, value]) =>
      delivery(
        "total",
        second,
        value,
        second === badTotalAt ? "BadNoCommunication" : "Good",
      ),
    ),
    ...counters.map(([second, value]) => delivery("good", second, value)),
    ...counters.map(([second]) => delivery("reject", second, 0)),
  ];
  const ledger = {
    total: 10,
    good: 10,
    reject: 0,
    reference: "Independent synthetic ledger",
    actorId: 1,
  };
  const known = shift(rollover.mapping, replay(), ledger);
  assert.deepEqual(known.seconds, {
    running: 60,
    idle: 0,
    fault: 0,
    planned: 0,
    unknown: 0,
  });
  assert.deepEqual(known.quantities, { total: 10, good: 10, reject: 0 });
  assert.equal(known.oee.availability, 1);
  assert(Math.abs(known.oee.performance - 1 / 3) < 1e-12);
  assert.equal(known.oee.quality, 1);
  assert(Math.abs(known.oee.overall - 1 / 3) < 1e-12);
  assert.equal(known.verified, true);

  // A bad total sample at the wrap boundary must not produce a complete interval or OEE.
  const gap = shift(rollover.mapping, replay(30), ledger);
  assert.notEqual(gap.quantities.total, 10, "Missing boundary is not bridged");
  assert.equal(gap.oee.performance, null);
  assert.equal(gap.oee.quality, null);
  assert.equal(gap.oee.overall, null);
  assert.equal(gap.verified, false);

  // Without the explicit modulus the same decrease is rejected, not guessed as a wrap.
  const noModulus = { ...rollover.mapping, counterPolicy: "reject-decrease" };
  delete noModulus.counterModulus;
  const rejected = shift(noModulus, replay(), ledger);
  assert.notDeepEqual(rejected.quantities, known.quantities);
  assert.equal(rejected.oee.overall, null);
}

// #16 Path containment with existing files and a directory link to an owned sibling.
const temp = await mkdtemp(join(tmpdir(), "pd-catalog-paths-"));
const root = join(temp, "root");
const outside = join(temp, "outside");
const link = join(root, "linked");
try {
  await mkdir(join(root, "profiles"), { recursive: true });
  await mkdir(outside);
  await copyFile(
    "profiles/owned-factory.json",
    join(root, "profiles", "owned-factory.json"),
  );
  await writeFile(join(root, "evidence.md"), "synthetic in-root evidence\n");
  await writeFile(join(outside, "evidence.md"), "synthetic sibling evidence\n");
  // Windows: a junction needs no symlink privilege; Linux/macOS: a directory symlink.
  await symlink(
    outside,
    link,
    process.platform === "win32" ? "junction" : "dir",
  );
  await stat(join(link, "evidence.md")); // The link resolves, so ENOENT cannot mask the check.

  const entry = (evidence) => [
    {
      ...structuredClone(catalog[0]),
      qualification: { ...catalog[0].qualification, evidence },
    },
  ];
  assert.equal((await validateCatalog(entry(["evidence.md"]), root)).length, 1);
  for (const evidence of ["../outside/evidence.md", "linked/evidence.md"])
    await assert.rejects(
      () => validateCatalog(entry([evidence]), root),
      /Catalog path escapes repository/,
      evidence,
    );
} finally {
  // Remove the link itself, never its target, and only inside the owned temp directory.
  const owned = resolve(temp) + sep;
  assert(resolve(link).startsWith(owned) && resolve(outside).startsWith(owned));
  const linkStat = await lstat(link).catch(() => null);
  if (linkStat) {
    assert(
      linkStat.isSymbolicLink(),
      "Expected the owned link, not a directory",
    );
    await unlink(link);
  }
  if (await stat(outside).catch(() => null))
    assert.equal(
      await readFile(join(outside, "evidence.md"), "utf8"),
      "synthetic sibling evidence\n",
      "Removing the link kept its target",
    );
  await rm(temp, { recursive: true, force: true });
}

console.log(
  `PASS: ${checked.length} catalog entries; Boolean state 20/30/10 s with unknown kept; ` +
    "16-bit rollover 10/10/0 and no OEE across a bad boundary; " +
    "existing out-of-root files and directory links are rejected as escapes",
);
