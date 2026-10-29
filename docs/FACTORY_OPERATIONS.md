# Factory operations expansion

This wave implements six requested software workflows on top of factory readiness.
It does not replace the separate PR #63 endurance gate or qualify physical machines.
All acceptance fixtures use isolated databases, owned simulators and synthetic data.

## Reusable setup

Administrators open **Settings → Backup & Restore → Machine setup bundles**.
Choose a source machine and saved dashboards, then export. Choose a paused target
machine and load the file to preview counts and conflicts. Import adds new entries;
it does not replace existing mappings, rules or dashboards. Mappings and rules remain
disabled until reviewed through the existing machine/alarm configuration screens.
Namespace indexes and source node identities must be checked against the target.
Production-profile commissioning and independent reconciliation are separate steps.

The version-1 contract contains scalar signal mappings, machine-specific alarm rules,
supported built-in dashboard widgets/layouts, source identity and dashboard content
revisions. It never selects endpoints, credentials, certificate material, webhook
destinations or user accounts. Unsupported widget types, nested credential/destination
fields, other-machine bindings, duplicate identities, unknown versions and oversized
files are refused. Custom widgets, SVG instances, global rules and executable content
are outside this bundle format. The UI reports validation failures rather than
silently omitting unsupported items. Review labels and names before sharing files.

Portable widgets are `trendingExplorer`, `systemStatus`, `alarmDashboard` and
`alertSummary`. Trend settings require the source machine and up to 32 distinct
signal keys present in the bundle; import remaps the machine to the target.
The other three are access-scoped system summaries, not target-machine indicators.
Settings have explicit type/range limits and unknown settings are refused.
Legacy random uptime, fixed operation-mode pie, zero-filled air consumption and
the unscoped operation-mode listener are excluded from portable setup.

Preview fingerprints bind both file contents and current target configuration.
Import checks them again in the same transaction as its writes. Concurrent submissions
cannot apply the same preview twice. The durable import receipt supports rollback
while the target is paused and imported items are unchanged. Later edits, dashboard
grant changes, notes, sharing/history or recorded alarms prevent automatic rollback.
Existing source/target items are preserved.
This is configuration portability, not a complete backup; use [operations](OPERATIONS.md)
for database, spool, PKI, reports and secret-key recovery.

## Connection diagnostics and alarm review

**Daily operations → Connection diagnostics** exposes requested/revised sampling,
monitored-item status, queue settings, reconnect observations and freshness. Counters
are observations since the current process started; missing diagnostics remain unknown.
The spool still acknowledges only durable writes and retains entries until PostgreSQL
confirms them. Diagnostics do not infer an exact lost-sample count.

Subscription limits are per endpoint. The collector requests a 500 ms publishing
interval, a queue of 10 per signal and 100 notifications per publish; **Custom
subscription limits for this endpoint** in the machine form overrides them
(publishing 50–60,000 ms, queue 1–1,000, notifications 0–10,000 where 0 means the
server's limit). The server may revise them; diagnostics show requested and revised
values and the overflow indications the server reports when a queue drops values.
Raise the queue or shorten publishing only with the PLC owner's approval. Each client
waits a randomised 1–1.5 seconds before its first reconnect attempt so machines that
lose the same network do not reconnect at the same instant
(`scripts/test-subscription-limits.mjs`: seven clients against one owned server).

**Alarm usefulness** shows bounded historical incidents, repetitions, acknowledgement
delays, suppression and available delivery evidence. Read-only threshold replay uses
recorded measurements and marks incomplete or ambiguous evidence explicitly. It does
not modify rules, send notifications or prove that a changed threshold is suitable
for the physical process. Supervisor access is limited to assigned machines.

## Reviewed work-order exchange

**Daily operations → Work orders** accepts versioned, vendor-neutral JSON files
containing at most 100 rows, with one order creating one production shift.
Preview validates each row and explains rejected rows; apply revalidates the reviewed
payload. Stable source/external identities prevent duplicate imports and changes to an
already imported order require explicit review rather than silent replacement.
Reviews expire after one hour. Completion export returns the latest 100 imports
with a truncation flag, uses saved report revisions and retains their verification/coverage
status. There is no remote ERP write or vendor-specific connector. A named pilot must
validate field meanings before an ERP integration can be qualified.

## Practical asset overview

**Daily operations → Asset overview** displays configured, sanitized SVG instances
for the selected machine. Components can be selected with the keyboard or pointer
to inspect current values, quality/freshness, bounded history, alarms and maintenance.
The view uses existing signal identities and machine grants. Missing, stale or bad
samples do not become healthy indicators. Template editing remains administrator-only.
This is an operational visualization, not a physics simulation.

## Repeatable demonstration

With Node.js 24, the installed workspace dependencies, Chromium, the owned local
PostgreSQL fixture on port 55432, `server/.env` from the example, and a current server
build, run:

```text
node scripts/demo-factory.mjs
```

The demonstration runs existing real browser and owned-simulator acceptance scenarios
for commissioning, alarms, unknown quality/replay, reports, setup transfer and work orders.
It creates an HTML walkthrough and hashed screenshot manifest under
`.local/factory-demo-<timestamp>`. Only whitelisted synthetic media is copied.
The one-minute independent shift ledger has 30 seconds running, 30 seconds stopped,
15 total parts, 13 good and 2 rejected; reconciled OEE is 43.33%. Failed steps prevent
publication of a passing manifest. No long-running demo account or database is left.

## Versioned offline release candidates

The step-by-step procedure, including publisher-key custody and evidence collection,
is in [releasing](RELEASING.md). Release notes are generated per version: merged
changes since the previous tag, new migrations and every open P0/P1 item, and the
package carries the compatibility list.

The existing offline image package now has an optional signed release envelope.
First validate a clean source revision and the image built with that exact revision:

```text
docker build --build-arg SOURCE_REVISION=FULL_COMMIT_SHA -t performance-dashboard:candidate .
node scripts/release-package.mjs create --directory .local/release-candidate --image performance-dashboard:candidate --version 1.1.0-rc.1 --evidence PATH_TO_VALIDATION_JSON --signing-key PRIVATE_ED25519_PEM --public-key TRUSTED_PUBLIC_PEM
node scripts/release-package.mjs verify --directory .local/release-candidate --public-key TRUSTED_PUBLIC_PEM
```

The evidence JSON must identify `sourceRevision`, `imageDigest`, `passed: true` and
a nonempty `checks` array of named passing checks. Keep the original detailed test
receipts with it. The tool requires a clean checkout, a matching image revision label
and an independently held Ed25519 key pair. It never generates or embeds a signing
private key. A local fixture key validates the mechanism only; it is not a trusted
publisher identity. Do not publish a production release while acceptance gates remain open.

The package includes application/database images, their digests, the exact source
revision, release notes, migration hashes, a locked source/build CycloneDX SBOM,
dependency-license inventory, operations/rollback instructions and hashed evidence.
The SBOM is the application dependency tree, not a complete operating-system SBOM.
Verification checks the signature using the caller's trusted public key, every file
hash, required files, unexpected files and matching evidence/image identities. Hashes
or a public key obtained only from an untrusted package are not publisher trust.
The verifier is included for offline use; obtain the verifier/key through a trusted
channel before executing downloaded code. Verify before using the existing offline
installer, which starts a new installation in recovery preview. Upgrade/rollback
continues to use the complete-backup workflow in [operations](OPERATIONS.md).

## Validation

Focused fixtures: `test-configuration-bundles.mjs`, `test-work-orders.mjs`,
`test-operational-diagnostics.mjs`, `test-asset-overview.mjs`, and
`test-release-package.mjs`; unit coverage
checks validation, identities, queue observations, replay and tampering. Both builds,
client types, lint/format, existing browser regressions, recovery and container
operations are integration gates. Final run receipts and exact revision are recorded
with the pull request; a list of scripts is not evidence that they passed.

Physical-machine, ERP field-semantic, publisher-key custody, production deployment
and the separate 72-hour endurance gates remain open until independently evidenced.
