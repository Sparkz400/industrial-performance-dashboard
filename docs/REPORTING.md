# Scheduled reports and container migration

The production image uses Node.js 24 on Wolfi and generates PDFs directly with
PDFKit. It needs no installed browser, browser download or system font package.
Development browser tests still use Playwright Chromium. The separate reconciled
production shift report still prints through the user's browser.

## Supported workflow

Create a report under **Report Templates**, select its sections, and optionally
set a title and reporting window. The default is the last 24 hours ending at run
time. A weekly window can use 168 hours. The shift/daily/weekly category is a
label; it does not silently change the window or select a production shift.

Under **Report Schedules**, select the template, machines, cron expression and
timezone. A section's explicit machine overrides the schedule's machine selection;
otherwise that section repeats for each selected machine. Trending requires mapping
names in **Trend signals** (up to 32). OEE requires a configured machine.

Use **Run Now** or wait for the schedule, then download the completed PDF from
**Report History**. Template/schedule changes and manual runs require an admin;
signed-in viewers can download this installation's reports. Existing history and
report files remain readable without conversion.

| Existing capability | Migrated behavior and evidence |
| --- | --- |
| Trend summaries | Latest displayed value, average/minimum/maximum, zero/null, usable sample counts, resolution and truncation/continuity notices retained. |
| Alarm history | Time, severity, status, rule, message and trigger value retained; latest 200 rows with an explicit cap notice. Long messages continue on the next page. |
| OEE summary | Availability/performance/quality, quantities, running/planned stop time and provisional-coverage warning retained. |
| PDF layout | A4, custom titles, embedded fonts, repeated table headings, page numbers and explicit period/timezone. Layout changes; calculations do not. |
| Manual and scheduled runs | Real browser and timer tests create files/history; timezone and DST unit tests cover the schedule parser. Same-schedule overlap is blocked within one process. |
| Email attachment | The generated PDF is attached through the existing SMTP service; an in-memory email test verifies the complete PDF bytes. No external mail is sent by tests. |
| Existing deployment data | Same PostgreSQL schema, volume paths and user/group 1000. Fresh/repeated migrations, generated-file restart persistence and collector crash/outage replay pass in the actual image. |
| Industrial collection | Owned OPC UA certificate creation, read and live subscription, SQLite, bcrypt, tracing and PostgreSQL tests run in the image. Physical-device qualification remains separate. |

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in the
server environment for email delivery. With no SMTP host, generation/download
still works and email is skipped. Container users must pass these variables to the
app service. A completed history entry means the PDF was written; it does not
prove email delivery. Email failures are logged and do not delete the PDF.

The template API retains `templateConfig.sections` with `trending`, `alerts` and
`oee` types. Optional `title`, `lookbackHours`, section `machineId` and `nodeKeys`
are validated. Older custom fields remain stored. Unsupported legacy section
types appear as unavailable in the PDF. Uptime charts and report Slack/Teams/webhook
delivery never had an implementation; the editor now offers the implemented
sections and email channel. No working report feature relies on arbitrary HTML,
custom CSS, external images or browser automation.

## Upgrade and rollback

1. Preserve the current image tag and back up PostgreSQL plus the measurement,
   certificate and report volumes using your established backup procedure.
2. Build with `docker compose build --pull`, then recreate the app with
   `docker compose up -d --no-deps app`. Keep the existing volume names and database.
   No schema or credential reset is part of this migration.
3. Sign in, check machine connectivity and measurement history, create a manual
   report, download an older report and check the next scheduled run. Confirm SMTP
   delivery in your own mail environment if you use it.
4. To roll back, stop the app and select the retained previous image with the same
   database and volumes. Older images ignore the new window/machine-selection
   behavior and contain the previously documented security findings. Do not use
   `down -v` or remove volumes as part of an upgrade or rollback.

## Evidence and limits

`scripts/test-report-pdf.mjs` and `scripts/check-report-pdf.py` verify a standard
report and a 200-row, ten-page stress report, including a message longer than a
page, Unicode text, all row markers, footers, zero values, unknown data and failed
file publication. The rendered PDFs were visually reviewed against the old main
HTML renderer on the same fixture. The new standard layout fits one page; the old
layout used two and split an alarm row across pages. Values and all three sections
remain present. Evidence lives in `.local/report-evidence/` and CI artifacts.

`scripts/test-production.mjs` covers browser create/edit/reload, schedule settings,
manual/automatic runs, history/download and authorization. `scripts/test-runtime.mjs`
and `scripts/test-container.mjs` cover actual production-runtime behavior. See the
[security review](DEPENDENCY_REVIEW.md) for image identity and unfiltered scans.

Embedded Noto Sans is validated for Latin (including German), Greek, Cyrillic and
engineering units. CJK, Arabic shaping, emoji and arbitrary Unicode fonts are not
qualified. The schedule remains a single-process timer: missed-run replay,
cross-process locking, durable email retry/deduplication and separate delivery
status remain **R03**. Immutable report inputs/revisions remain **R04**. This
migration does not imply production, tenant-isolation or physical-machine acceptance.
