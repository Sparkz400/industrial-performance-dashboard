# Data ownership, residency and retention

The deployment operator owns everything this application stores. Data stays in the
PostgreSQL database and local directories the operator runs, and leaves them only
through an export a signed-in user starts or an outbound flow an administrator
configures. This page lists both, how data is deleted or retained, and which actions
leave an audit record. It describes the software; it is not a statement of compliance
with any jurisdiction's data-protection law, which depends on how and where the
operator runs it.

## Where data is stored

**PostgreSQL** (`server/src/database/schema.ts`), grouped by purpose:

| Category | Tables |
| --- | --- |
| Accounts and access | `users`, `session`, `machine_grants`, `plants`, `plant_memberships`, `machine_sites`, `dashboard_assets`, `share_tokens` |
| Machine configuration | `machines`, `node_mappings`, `machine_credentials`, `machine_profiles`, `derived_signal_definitions`, `config_bundle_imports`, `oee_config`, digital-twin, dashboard and widget tables, `annotations` |
| Measurements and history | `opcua_data`, `opcua_data_dlq`, `history_summaries`, `history_state_seconds`, `history_counter_increments`, `measurement_corrections`, retention policy/preview/schedule tables, `storage_observations` |
| Production and reports | shifts, calendars, report revisions, `changeover_standards`, `improvement_actions`, downtime reasons, operator entries (including manual state and quantity declarations), lines, work-order imports, report templates/schedules/history |
| Quality, batches and SPC | recipes, batches, inspections, rework, `batch_lots`, `batch_lot_corrections`, `inspection_plans`, `job_inspections`, SPC profiles/alerts/baselines |
| Maintenance and energy | maintenance plans/events/actions, `maintenance_attachments` (uploaded files up to 5 MB each, stored in the database), CMMS handoffs, energy meters/reconciliations/tariffs |
| Alarms and outbound delivery | alert rules and versions, alert history, notification channels, alarm evaluation state, `webhooks`, `webhook_deliveries` |
| Audit | `audit_logs`, `compliance_audit_logs` |

Personal data and secrets in the database:

- **Encrypted:** OPC UA machine secrets (`machine_credentials.encrypted_secret`,
  AES-256-GCM). The key is a file, `MACHINE_SECRETS_KEY_FILE`
  (default `data/machine-secrets.key`, mode 0600). The credential user name is plain text.
- **Hashed:** account passwords (bcrypt) and new share links. Legacy plaintext share
  tokens are refused.
- **Plain text:** user names and email addresses; webhook URLs, signing secrets and email
  recipients; report schedule recipients; the user name and IP address in audit records;
  session data (user id, name, role).

Other storage on the server host:

| Data | Location (default) |
| --- | --- |
| Measurement spool and quarantine (SQLite) | `OPCUA_SPOOL_PATH` (`data/measurements.sqlite`) |
| Machine-secret key | `MACHINE_SECRETS_KEY_FILE` (`data/machine-secrets.key`) |
| OPC UA certificates and private key | `OPCUA_PKI_DIR`, otherwise the node-opcua profile directory or `./certificates`; the gateway uses `<spool dir>/gateway/pki` |
| Generated report PDFs | `REPORTS_DIR` (`reports`) |
| Application and request logs (URL, IP, user agent) | `logs/`, rotated after 30 days |
| Backups made by `scripts/operate.mjs` | database dump, `data/` (including the key file), `certificates/`, `reports/` and `runtime.json` with the full environment, mode 0600 |

## Data that leaves the installation

**Exports** a signed-in user starts. Each one is audited when its response closes,
with the user, entity, path, status and whether the download completed
(`export.*` actions):

| Export | Who |
| --- | --- |
| Trend CSV (`/trending/export-csv`) | any role granted the machine |
| Generated report PDF download | administrator |
| Configuration bundle (no credentials) | administrator |
| Support diagnostics (redacted list in the response) | administrator |
| Compliance audit export and compliance report | administrator |
| Work-order completion facts | supervisor or administrator granted the machine |
| Lot and batch trace | administrator |
| Quarantined measurements (`collector.quarantine.exported`) | administrator |

Screens that show data (shift reports, comparisons, replays, widget evidence) are views,
not exports, and are not audited. Public share links are scoped to a frozen widget
selection and time window; creating and revoking them is audited, opening them is not.

**Outbound flows**, all off until configured:

| Flow | Enabled by | What is sent |
| --- | --- | --- |
| Webhooks | an administrator creating a destination | alarm events, maintenance escalations, CMMS handoffs; HMAC-signed with the destination's secret; private addresses refused unless `ALLOW_PRIVATE_OUTBOUND_URLS=true` |
| Email | `SMTP_HOST` plus an email destination or report schedule | report PDFs to schedule recipients; alarm text to email destinations |
| Tracing | `OTEL_ENABLED=true` (default off) | request and database spans, including SQL parameters, to `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Custom widgets | an administrator registering a manifest URL | the server fetches that manifest |
| OPC UA | each configured machine endpoint | subscriptions and certificate exchange with that machine |

The application has no update check, usage telemetry or CDN: fonts and scripts are
served from the installation. The integration API is inbound and uses normal sign-in.
`EDGE_MODE_ENABLED`, `EDGE_CLOUD_URL`, `EDGE_DATA_RETENTION_DAYS` and
`WEBHOOK_SIGNING_SECRET` are accepted settings that currently do nothing; edge sync
sends nothing.

## Deletion and retention

| Data | Rule | Audit record |
| --- | --- | --- |
| Measurements | Never deleted automatically. An administrator saves a policy, reviews an exact preview and applies it (now or scheduled within the preview's hour). Shift, batch and active-maintenance evidence is protected; removed rows keep hourly summaries, state seconds and counter increments ([history](DAILY_OPERATIONS.md#history-storage-and-retention)). | `retention.policy.saved`, `retention.preview.created`, `retention.scheduled`, `retention.applied` with the removed count; a scheduled run names the administrator who scheduled it |
| Report PDFs | Kept unless `REPORT_RETENTION_DAYS` is set; then older files are removed and the history row keeps `fileRemovedAt` | `retention.report_files.removed` with the report IDs |
| Sessions | Expire after two hours; pruned every 15 minutes | no |
| Storage observations, retention preview rows | Removed after two days and one hour respectively | no |
| Lot links, downtime reasons, measurement corrections, report revisions, maintenance history and attachments, job inspections, improvement actions | Never edited or deleted; corrections are appended | the correction record itself |
| Configuration (annotations, alarm and alert rules, notification channels, custom widgets, digital twins, SPC profiles, report templates and schedules, outbound destinations) | Deleted on request | `*.deleted` / `*.created` / `*.updated` with the actor |
| Users | No delete; deactivation through the account form | `user.updated` with previous and new values |
| Machines | Deletion is refused while production, maintenance, energy, correction, import or CMMS records exist; otherwise grants, credentials, rules and operator entries go with it and measurements keep a null machine | `machine.deleted` |

Not cleaned up automatically: `webhook_deliveries` (until their destination is deleted),
`opcua_data_dlq`, `edge_sync_queue`, `alarm_evaluation_receipts` and both audit tables.

## Access review

Administrators see every account, role, machine grant, site membership and dashboard
scope under **Settings → People & Access**. These are audited: sign-in, sign-out, failed sign-in
(wrong password or deactivated account by account; an unknown name is recorded as
unknown so a password typed into the name field is never stored), password changes,
account creation and changes (previous and new email, role and active state), grant and
site changes (previous and new machine and site lists) and dashboard scope changes.

## What an audit record is and is not

An audit record holds the action, entity, message, metadata, user id, name, role, IP
address (first `X-Forwarded-For` entry) and time. Requests the server refuses are not
recorded. Records are written after the change, and a failed write is logged as a
warning rather than undoing the change. `audit_logs` is readable by administrators (at
most 500 rows per query), has no export, no retention rule and no tamper detection;
the separate compliance log is checksum-chained
([audit limits](QUALITY_LINE_OPERATIONS.md#audit-records-signatures-and-their-limits)).
Treat database administrators as able to change both.

## Operator responsibilities

- Store backups as secrets: they contain the machine-secret key beside the encrypted
  credentials and every environment secret.
- Keep a tracing collector inside the same boundary as the database, because spans carry
  SQL parameters.
- Decide where PostgreSQL, the server host, backups and any SMTP, webhook or tracing
  receivers are located; that choice determines data residency.

`scripts/test-data-ownership.mjs` checks failed sign-ins, an export, retention, a
refused and an accepted deletion, destination changes with the secret shown only at
creation, and access changes with their previous values.
