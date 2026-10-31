# Portable shift evidence

On **Production**, select a shift and choose **Export reproducible evidence**.
The same session and machine access checks as the shift report protect the download.
Successful exports record their actor and shift in the application audit log.
The existing report JSON/print exports remain available.

The version-1 JSON bundle contains:

- The current shift report, frozen profile and cycle standards, breaks and product runs.
- Exactly the calculation inputs: selected measurements and their raw values,
  effective numeric values, source identities, quality/clock flags, source/receive
  timestamps and correction revision numbers.
- Reviewed quantity/state declarations, reconciliation totals and downtime-reason history.
- Current plan version and up to 100 historical report-revision references (ID,
  digest, reason and date). These references are not historical snapshots or claims
  that old revisions reproduce from today's retained measurements.
- The original calculation time, available application source revision, a SHA-256
  digest of the canonical payload and the calculator source fingerprint.

An unfinished shift is replayed at its original calculation time.
The export reads a single repeatable database snapshot, so concurrent corrections
cannot mix different moments within a bundle. It fails rather than truncating at
32 MiB, 100,000 calculation input samples across the shift/product runs, 1,000
reasons/manual declarations or 100 revision references. Database statements time
out after 15 seconds. Large/high-frequency shifts need a shorter export window.

## Reproduce without an application or database

Keep the source checkout that produced the export. With Node.js 24, run:

```sh
node scripts/verify-shift-evidence.mjs path/to/shift-123-evidence.json
```

No installed npm packages, database, dashboard server or network connection are
needed for this checker. For a smaller offline transfer, preserve the directory
structure of these three trusted repository files alongside the JSON:

```text
scripts/verify-shift-evidence.mjs
server/src/services/shiftCalculation.ts
server/src/utils/canonicalJson.ts
```

The checker verifies the payload hash and calculator fingerprint, reconstructs
numeric inputs using their source identities, recalculates each product run and
the shift, and compares the calculated report. Generation timestamps, stored
measurement-fingerprint summaries and plan-version metadata are excluded from the
calculation comparison; the payload digest still covers them. The calculator
fingerprint uses UTF-8 text with LF line endings, consistently on Linux and Windows.
Use a trusted checkout: never execute code supplied by an untrusted evidence sender.

Successful output has `reproduced: true`, calculated OEE, remaining issues and
`authenticated: false`. Reproduction is successful even if OEE is unknown: it
means the same missing-data/quality result was obtained. A wrong hash, missing
run input, mismatched calculator, source-identity change or non-reproducing result
exits with an error. Hashes do not authenticate a publisher; someone can change a
bundle and recompute its digest. Physical accuracy and publisher signing remain
separate acceptance steps.

## Sharing and limits

The export excludes handover notes/usernames, machine credentials, connection
endpoints and unrelated machines. It **does include** production names, namespace
identities, job/reference and downtime text, timestamps and numeric record/actor
IDs. Review it before sharing; it is not automatically anonymous. Editing it
invalidates its digest. No upload or automatic external sharing occurs.

This first scope covers one shift/OEE calculation and its current retained inputs.
It does not reproduce all historical revisions, retrieve measurements removed by
retention, include a complete audit log, sign a release or qualify physical machinery.
Validation: `scripts/test-community-workflows.mjs` covers independent totals, quality,
gaps, resets, multiple product standards, corrections, access, tampering and a real
browser download. Existing shift-calculation tests cover the underlying time and
counter rules.
