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

Replace `machineId` `1` with the ID of your machine (**Machines** lists it) before
importing. Machine credentials are never part of these files; enter them in the machine
form, where they are stored encrypted.

To contribute an example, use an owned simulator or a sanitized export: remove machine
names, endpoint addresses, users, credentials, certificates and measurement values that
identify a site, and add the expected output and a check to `scripts/test-examples.mjs`.
