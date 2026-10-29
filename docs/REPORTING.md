# Scheduled reports and container migration

The production image uses Node.js 24 on Wolfi and generates PDFs directly with
PDFKit. It needs no installed browser, browser download or system font package.
Development browser tests still use Playwright Chromium. The separate reconciled
production shift report still prints through the user's browser.

## Supported workflow

Create a report under **Report Templates**, select its sections, and optionally
set a title and reporting window. The default is the last 24 hours ending at
the saved scheduled instant (or manual request time). A weekly window can use 168 hours. The shift/daily/weekly category is a
label; it does not silently change the window or select a production shift.

Under **Report Schedules**, select the template, machines, cron expression and
timezone. A section's explicit machine overrides the schedule's machine selection;
otherwise that section repeats for each selected machine. Trending requires mapping
names in **Trend signals** (up to 32). OEE requires a configured machine.

Use **Run Now** or wait for the schedule, then download the completed PDF from
**Report History**. Template/schedule changes and manual runs require an admin;
report management and downloads are administrator-only. Existing history and
report files remain readable without conversion.

| Existing capability | Migrated behavior and evidence |
| --- | --- |
| Trend summaries | Latest displayed value, average/minimum/maximum, zero/null, usable sample counts, resolution and truncation/continuity notices retained. |
| Alarm history | Time, severity, status, rule, message and trigger value retained; latest 200 rows with an explicit cap notice. Long messages continue on the next page. |
| OEE summary | Availability/performance/quality, quantities, running/planned stop time and provisional-coverage warning retained. |
| PDF layout | A4, custom titles, embedded fonts, repeated table headings, page numbers and explicit period/timezone. Layout changes; calculations do not. |
| Manual and scheduled runs | Durable jobs, stable periods, missed-slot catch-up and database locks; process termination and concurrent cursor tests cover recovery. |
| Email attachment | Persisted delivery attempts, partial-recipient retries and separate failure status; tests use an owned loopback receiver and verify the PDF bytes. |
| Existing deployment data | Additive database migrations retain old history. Volume paths and user/group 1000 remain compatible; use complete backup/restore for rollback. |
| Industrial collection | Owned OPC UA certificate creation, read and live subscription, SQLite, bcrypt, tracing and PostgreSQL tests run in the image. Physical-device qualification remains separate. |

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in the
server environment for email delivery. With no SMTP host, generation/download
still works and requested email remains visibly blocked. Container users must pass these variables to the
app service. A completed history entry means the PDF was written; it does not
prove email delivery. Email failures have separate persisted status and do not delete
the PDF. See [retry semantics and limits](UNATTENDED_OPERATION.md).

Deleting a schedule cancels its queued runs and any email not yet delivered; a run
already generating may still finish. Stored PDFs are kept until `REPORT_RETENTION_DAYS`
is set (whole days). The health worker then removes completed PDFs older than that
from the reports directory, never files elsewhere or PDFs still awaiting email, and
their history entries answer downloads with 410 and record when and why. Unset keeps
every PDF. Report management and downloads remain administrator-only; a demoted
account loses access on its next request (`scripts/test-report-boundaries.mjs`).

The template API retains `templateConfig.sections` with `trending`, `alerts` and
`oee` types. Optional `title`, `lookbackHours`, section `machineId` and `nodeKeys`
are validated. Older custom fields remain stored. Unsupported legacy section
types appear as unavailable in the PDF. Uptime charts and report Slack/Teams/webhook
delivery never had an implementation; the editor now offers the implemented
sections and email channel. No working report feature relies on arbitrary HTML,
custom CSS, external images or browser automation.

## Upgrade and rollback

Use the [complete backup, upgrade and rollback workflow](OPERATIONS.md). This wave
adds persistent job fields and migrations. Rollback restores the saved image,
database and files into a fresh recovery preview; do not run an old image against
a partially upgraded database or erase volumes. Check older downloads, a new manual
run, the next scheduled slot and your SMTP environment before acceptance.

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
qualified. Scheduling and retry semantics are documented in [unattended operation](UNATTENDED_OPERATION.md).
Immutable measurement snapshots and published report revisions remain **R04**. This
migration does not imply production, tenant-isolation or physical-machine acceptance.
