# Current status

Performance Dashboard is development software. Its intended starting point is an
owned simulator or an isolated test installation using OPC UA scalar signals.

## Implemented and covered by focused tests

- Raw Boolean, string and numeric measurements with quality metadata and numeric projection.
- Durable local queue reopen/replay and stable event identities after failed writes.
- OEE boundary clipping, unchanged states, missing intervals and observed counter resets.
- Explicit incomplete-coverage handling and conversion of API ratios to UI percentages.
- Authenticated application routes and configurable machine/tag management.

Consult the CI run for the exact commit you intend to use. Hosted tests and local
simulator evidence do not establish physical-machine acceptance or release readiness.

## Known limits

- No physical machine or production-line qualification has been completed here.
- OPC UA anonymous sessions and scalar values are the supported connection scope.
- Process crashes and unobserved machine events can leave uncertain intervals;
  reconnection notifications cannot reconstruct measurements never received.
- Counter decreases are treated as resets to zero. Rollover, negative counters,
  shifts/timezones and daily manual-entry aggregation need further qualification.
- The disk spool needs free space, a persistent volume and a single collector.
- Edge/cloud synchronization, compliance, recipes, digital twins and natural-language
  features are experimental; they are not acceptance-tested as complete products.
- Separate companies must use separate installations. Tenant isolation is unqualified.
- Dependency auditing still reports moderate advisories. Security CI blocks high
  and critical runtime advisories and uploads the complete audit report; inspect
  it alongside the functional checks.
- Container scans also report operating-system and Chromium advisories in GitHub
  code scanning. These are reported, not suppressed or treated as passing release
  acceptance; review the exact image before deployment.

## Next acceptance milestone

One installation, one production line, a small set of explicitly documented
machines and a complete shift report reconciled with independent measurements.
Include downtime, reconnects, counter resets and database interruptions.
