# Current status

Performance Dashboard is development software. Its intended starting point is an
owned simulator or an isolated test installation using OPC UA scalar signals.

## Implemented and covered by focused tests

- Raw Boolean, string and numeric measurements with quality metadata and numeric projection.
- Durable queue recovery through process termination, database connection outage,
  interrupted replay and SQLite capacity failure; accepted events retain stable identities.
- One alarm evaluator, atomic event receipts, persisted webhook retries and measured recovery.
- UI commissioning, reusable immutable profiles, shift snapshots, operator corrections
  and a reconciled/printable shift report verified against an independent fixture.
- Current-account REST/tRPC permissions, signed-in socket actors, logout and expiry.
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
- Shift profiles explicitly choose reset-to-zero or reject-decrease. Legacy OEE
  still assumes reset-to-zero; rollover and daily manual entries remain unqualified.
  Shift windows use explicit offsets and IANA timezones; recurring calendars and
  holidays remain open. Unsampled counter boundaries prevent a verified report.
- The disk spool needs free space, a persistent volume and a single collector.
- Edge/cloud transfer and ingest are disabled: previously transferred queue records
  do not establish queryable central history. Retained records remain visible in settings.
- AI provides suggestions only, discloses Anthropic processing and never executes SQL
  or renders provider-invented measurement charts. Missing configuration returns 503.
- Compliance, recipes and digital twins remain experimental. Public shares/embeds
  and legacy notification channels are disabled. The tested single-company permission
  policy does not establish site/asset or tenant isolation. See the
  [production workflow and evidence](PRODUCTION_WORKFLOW.md) and [TODO](../TODO.md).
- Separate companies must use separate installations. Tenant isolation is unqualified.
- The full npm audit reports zero vulnerabilities, including development tools.
  Security CI now blocks advisories at every severity and preserves the full audit.
  Scoped UUID/esbuild overrides and their compatibility checks are documented in
  [the review](DEPENDENCY_REVIEW.md). CSRF and cross-origin socket regression checks pass.
- Container scans also report operating-system and Chromium advisories in GitHub
  code scanning. These are reported, not suppressed or treated as passing release
  acceptance; review the exact image before deployment. The rebuilt Debian image
  retains 413 findings (one critical, 66 high), all without available package fixes.
  CI scans pull requests and main, preserves image identity/full reports, and blocks
  fixable high/critical findings. This gate does not approve the remaining risks.

## Next acceptance milestone

One installation, one production line, a small set of explicitly documented
machines and a complete shift report reconciled with independent measurements.
Include downtime, reconnects, counter resets and database interruptions.

The [roadmap](ROADMAP.md) describes staged acceptance gates and future features.
Planned work does not expand the supported scope above.
