# Current status

Performance Dashboard is development software. Its intended starting point is an
owned simulator or an isolated test installation using OPC UA scalar signals.

## Implemented and covered by focused tests

- Raw Boolean, string and numeric measurements with quality metadata and numeric projection.
- Durable local queue reopen/replay and stable event identities after failed writes.
- OEE boundary clipping, unchanged states, missing intervals and observed counter resets.
- Explicit incomplete-coverage handling and conversion of API ratios to UI percentages.
- Authenticated application routes and configurable machine/tag management.
- New-measurement source identity, mapping revision and receive time survive replay;
  legacy rows retain unknown provenance rather than receiving invented metadata.
- Machine/profile-isolated SPC state and baselines; statistical qualification remains open.
- Full-window bounded trend aggregation, quality gaps and visible resolution/counts.

See [P0 acceptance evidence](P0_ACCEPTANCE.md) for tests, fixtures and remaining work,
and [dependency PR dispositions](DEPENDENCY_REVIEW.md) for the reviewed update set.

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
- Edge/cloud transfer and ingest are disabled: previously transferred queue records
  do not establish queryable central history. Retained records remain visible in settings.
- AI provides suggestions only, discloses Anthropic processing and never executes SQL
  or renders provider-invented measurement charts. Missing configuration returns 503.
- Compliance, recipes and digital twins remain experimental. Alert/webhook wiring
  and the full authorization/share/session audit remain open. Trend/SPC isolation
  fixes do not qualify these independent features. The [TODO backlog](../TODO.md)
  records the outstanding acceptance work.
- Separate companies must use separate installations. Tenant isolation is unqualified.
- The runtime dependency audit is clear in this wave; development tooling retains
  moderate advisories documented in [the review](DEPENDENCY_REVIEW.md). Security CI blocks high
  and critical runtime advisories and uploads the complete audit report; inspect
  it alongside the functional checks.
- Container scans also report operating-system and Chromium advisories in GitHub
  code scanning. These are reported, not suppressed or treated as passing release
  acceptance; review the exact image before deployment.

## Next acceptance milestone

One installation, one production line, a small set of explicitly documented
machines and a complete shift report reconciled with independent measurements.
Include downtime, reconnects, counter resets and database interruptions.

The [roadmap](ROADMAP.md) describes staged acceptance gates and future features.
Planned work does not expand the supported scope above.
