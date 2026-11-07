# Examples

Sanitized starting points. They contain no customer data, credentials, certificates or
real addresses; tag names follow the owned legacy fixture. `scripts/test-examples.mjs`
loads each one into an owned database and checks the expected output below.

| File | Use | Expected output |
| --- | --- | --- |
| [`legacy-gateway.json`](legacy-gateway.json) | Read-only Modbus TCP gateway configuration; see [legacy gateway](../docs/LEGACY_GATEWAY.md) | Gateway exposes the owned simulator registers as encrypted local OPC UA |
| [`legacy-production-profile.json`](legacy-production-profile.json) | Commissioning profile for that gateway's state and counter signals | Four signals preview with units; a shift report can be reconciled |
| [`dashboard-press-overview.json`](dashboard-press-overview.json) | **Dashboards → Import**, or `POST /api/v1/dashboards/import` | A dashboard with a production-count trend and a system status widget. Without history the trend shows no data rather than zeros |
| [`report-template-shift-summary.json`](report-template-shift-summary.json) | **Advanced → Reports → new template**, or `POST /api/v1/reports/templates` | A schedule's **Run now** completes and produces a downloadable PDF built from the *Production count*, *Alarms* and *OEE* sections; missing values print as N/A |
| [`grafana/`](grafana/) | `docker compose up -d` with `PD_URL`, `PD_SERVICE_TOKEN` and `GRAFANA_ADMIN_PASSWORD`; see [Grafana and Node-RED](../docs/INTEGRATIONS.md) | A provisioned *machine history* dashboard; non-Good samples and incomplete hours show as gaps, never as zero |
| [`node-red/`](node-red/) | Node-RED **Menu → Import**; see [Grafana and Node-RED](../docs/INTEGRATIONS.md) | One flow publishes JSON readings an MQTT source accepts; the other lists hourly summaries with unknown hours as `average: null` |
| [`shift-evidence-known.json`](shift-evidence-known.json) | `node scripts/verify-shift-evidence.mjs examples/shift-evidence-known.json`; see [below](#synthetic-shift-evidence) | `reproduced: true`, OEE 13/30 (0.4333…), 15 total / 13 good / 2 reject, `authenticated: false` |

Replace `machineId` `1` with the ID of your machine (**Machines** lists it) before
importing. Machine credentials are never part of these files; enter them in the machine
form, where they are stored encrypted.

To contribute an example, use an owned simulator or a sanitized export: remove machine
names, endpoint addresses, users, credentials, certificates and measurement values that
identify a site, and add the expected output and a check to `scripts/test-examples.mjs`.

## Synthetic shift evidence

[`shift-evidence-known.json`](shift-evidence-known.json) is an unmodified
[shift evidence](../docs/SHIFT_EVIDENCE.md) export of the synthetic *known* demo shift:
one minute, 30 s running and 30 s fault ("Synthetic jam"), counters 15 total, 13 good
and 2 rejects, matching the independent synthetic ledger. Its `sourceRevision` names the
commit it was exported from. It contains only synthetic names (`Demo known`,
`DEMO-001`, `Synthetic parts`), numeric record/actor IDs and timestamps from the
generation run: no users, endpoints, credentials or plant data.

Verify it without the dashboard, a database, installed packages or a network, by copying
only the trusted files into an empty directory, keeping their paths:

```text
scripts/verify-shift-evidence.mjs
server/src/services/shiftCalculation.ts
server/src/utils/canonicalJson.ts
server/package.json
shift-evidence-known.json
```

```sh
node scripts/verify-shift-evidence.mjs shift-evidence-known.json
```

The output has `reproduced: true`, `oee.overall` 0.4333… (13/30), no issues and
`authenticated: false`: the hash proves the bundle is internally consistent, not who
published it. `scripts/test-examples.mjs` checks these values and that a changed count fails.

**Regenerating.** The bundle records the calculator's SHA-256, so any change to
`server/src/services/shiftCalculation.ts` makes it fail with *Calculator differs*. That
is intended. To refresh it, run `node scripts/test-community-workflows.mjs` against the
owned test database with `SOURCE_REVISION` set to the current commit, copy
`.local/community-evidence/known.json` over this file, review every field again, and
confirm the quantities and OEE above are unchanged.
