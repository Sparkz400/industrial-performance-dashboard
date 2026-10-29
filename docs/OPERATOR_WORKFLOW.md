# Operator handover and supervisor wallboard

In **Production shift → Operator handover**, select a machine and record a note,
assigned action or manual quantity declaration. Link it to an existing shift and,
optionally, an observation interval inside that shift. The active shift supplies
work-order/product/target context. Outstanding items carry into the next handover
until someone resolves them; high-priority items come first.

Actions require an active operator or administrator as owner. Every revision keeps
its actor, time, text, priority, owner, due date and status. Concurrent edits return
a conflict; select **Review / edit** again to inspect the latest revision before
resubmitting. Retrying a failed submission uses the same request identity and does
not create a second entry. Attachments are not enabled.

Operators may declare total/good/reject counts. Good plus reject must equal total,
and the declaration must link to a shift. Supervisors and administrators can mark a declaration
reviewed. The shift report then shows the latest reviewed declaration. It replaces
machine counts only when a counter mapping is missing or has gaps, resets or unsampled
boundaries; the report labels the source and is never verified from a declaration.
With complete counters the report keeps the measured counts and flags any difference.
Product-run sections always use measured counts. To verify a shift, use the separate
reconciliation flow with independent evidence. Notes and actions can
be edited collaboratively by signed-in operators; this is a single-company policy,
not asset-level or tenant isolation.

**Open supervisor wallboard** displays up to six selected machines per page, with
optional 30-second rotation and browser fullscreen. It shows current shift/job,
observed counts against target, last measurement time, connection/freshness and up
to five outstanding items per machine. Counts with incomplete boundaries/gaps are
labelled partial. More than 10,000 current-shift counter samples makes this preview
unavailable; use the shift report for a larger historical query. Missing, bad,
stale, future-dated or disconnected signals produce **unknown**, never a healthy
running state. Failed or overdue display updates also replace states with unknown.

Administrators can create a dedicated `wallboard` account from the wallboard.
It uses ordinary expiring login sessions and can read only its granted machine/site data,
but cannot acknowledge alarms, classify stops, create entries or alter settings
through REST, tRPC or alarm sockets. Use it on shared displays instead of an admin
account. Session expiry requires sign-in again; there are no permanent public links.

## Evidence and limits

`scripts/test-operator.mjs`, run within `scripts/test-production.mjs`, uses an isolated
database, browser and owned fixtures. It exercises retries, conflicting revisions,
machine/shift isolation, manual-count validation/review, attributable history,
mobile handover, display-account creation and negative permissions. Unit tests
cover freshness boundaries and delayed replay. Screenshots are local test evidence.

This does not qualify production operator acceptance, accessibility compliance,
long-running wall-display sessions or readability at a particular viewing distance.
No machine-control command is introduced.

Machine grants and supervisor roles are administered under People & Access. See
[daily operations](DAILY_OPERATIONS.md) for inspections, recurring plans and energy.
