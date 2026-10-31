# Maintainer handbook

This is the working agreement for reviewing, maintaining and handing over Performance
Dashboard. It builds on [Contributing](CONTRIBUTING.md), [Security](SECURITY.md) and
[Support](SUPPORT.md). The project is development software for owned simulators and
isolated evaluation; no support SLA or long-term-support commitment is offered.

## People and responsibilities

The current project steward and sole listed code owner is
[@Sparkz400](https://github.com/Sparkz400), recorded in [CODEOWNERS](.github/CODEOWNERS).
No second maintainer or backup publisher is appointed. This handbook makes the work
transferable; an independent person's completed handover is still needed to demonstrate
maintainer independence. Publisher-key custody remains pending.

| Responsibility | Who carries it now | What it covers |
| --- | --- | --- |
| Scope and final decisions | Project steward | Priorities, disputed proposals, appointing maintainers and changing this agreement |
| Change author | Contributor making the PR | Reproduction, implementation, focused checks, documentation and stated limits |
| Review and integration | Steward; a delegated subsystem maintainer when appointed | Read the change and evidence, resolve comments, merge through the normal protected path |
| Release coordination | Steward until explicitly delegated | Freeze the revision, collect receipts, review open gates, prepare notes and coordinate publication |
| Publisher signing | A custodian explicitly appointed by the steward; currently pending | Offline private-key custody and independently distributed public-key fingerprint |
| Physical acceptance | The named equipment/process owner and pilot reviewers | Approved endpoint scope, independent observations and acceptance of the installation |

One person may perform several roles; record that fact in the PR or release evidence.
Repository access, release authority, signing custody and physical acceptance are
separate responsibilities. A contributor or code-owner entry alone does not confer them.
No additional account, access grant or signing key is created by this document.

## Decide and record scope

Use an issue for a reproducible bug or bounded improvement and
[Discussions](https://github.com/Sparkz400/performance_dashboard/discussions) for an
early proposal. Search existing work first. Record the affected workflow, parent
[TODO](TODO.md) ID, smallest useful outcome, exclusions and evidence needed to finish.
The steward or delegated maintainer records the accepted scope in that conversation.

Routine changes can proceed within an accepted issue. Before a change to data
semantics, a public contract, migrations, permissions, dependencies, operating limits
or release/support promises, record the proposed behavior and tradeoff for review.
Read shared types and callers together. Reuse existing services and test fixtures.
Missing samples remain unknown; durable buffering and replay guarantees must survive.

Prefer agreement based on reproducible evidence. If a disagreement remains, the
steward records the decision, alternatives considered, reason and conditions that
would reopen it. Capture lasting product/research decisions in
[research decisions](docs/RESEARCH_DECISIONS.md), with a link to the discussion/PR.
Amend this handbook through a normal reviewed PR; avoid creating a parallel policy
in an issue comment that contradicts it.

## Triage and help contributors

At each triage session, review new issues, PRs and security reports. Do not promise
a response date unless someone has accepted that responsibility. For each public issue:

1. Check for private data, duplicates and whether the reported behavior is reproducible.
   Route vulnerability details through [Security](SECURITY.md).
2. Record a useful title, observed/expected behavior or current gap, files to start
   with, bounded acceptance criteria and a test using synthetic data or owned equipment.
3. Use the existing labels: `bug`, `documentation`, `enhancement` and `dependencies`
   describe the work; `help wanted` invites contributions. Use `good first issue`
   only when the scope, setup and evidence are small and explained. Authentication,
   persistence repairs and unresolved endurance failures require experienced review.
4. Invite a contributor to comment before starting so work does not overlap. Assign
   only with that person's agreement; a label does not reserve work or promise mentorship.
5. If work stalls, ask for status before marking it available again. Preserve useful
   investigations and close duplicates with a link. Explain declined scope and how
   new evidence could reopen it; do not silently discard a reproduction.

GitHub issues track individual contributions. `TODO.md` remains the acceptance-status
source of truth. A small issue may improve an already implemented TODO area, or supply
only part of an open item. Closing it does not automatically check off its parent.

## Review and merge a change

Start from current `main` in an isolated checkout when another task or qualification
uses the primary checkout. Follow [Contributing](CONTRIBUTING.md) for Node.js 24,
the root npm lockfile, builds, type checks and tests. Never use production equipment,
an existing user's database or reset credentials to make a regression pass.

The reviewer checks the changed behavior, callers/shared contracts, unknown-data
handling, permissions, persistence and any migration/rollback implications. Tests
must demonstrate the requested outcome and relevant failure cases. UI changes need
real browser flows. Documentation-only changes need link/path and command review;
the repository's normal CI builds and checks still apply.

Attach the tested revision, commands, results and simulator/device scope to the PR.
For calculation changes, use the [public benchmark](benchmarks/correctness/README.md)
and independent reasoning; never regenerate expected answers merely to match a change.
For browser/CI failures, use [engineering feedback](docs/ENGINEERING_FEEDBACK.md).
Investigate failures before retrying and retain the first failure's evidence.

Seek review from another maintainer when available. While there is only one,
explicitly record self-review and its limit; do not claim independent human review.
Automated review or green checks do not substitute for physical acceptance or a
person's usability/accessibility assessment.

At the 2026-10-31 check, `main` requires an up-to-date branch and these passing checks:
`Validate (ubuntu-latest)`, `Validate (windows-latest)`, `Browser and database`,
`Container build`, `Secret scan`, `Dependency audit` and `CodeQL`. Protection applies
to administrators; force pushes and deletions are disabled. No required human-review
count is configured. These are a recorded snapshot: check current repository rules
before merging and update this record when the rules change. `CODEOWNERS` identifies
review responsibility; it does not by itself require a review or grant repository access.

Resolve material review comments and use the ordinary merge path. Never remove a
required check, treat a cancelled/skipped run as successful or bypass protection to
obtain a green result. Check the exact latest source revision; a successful predecessor
does not validate a later push. Verify CI on merged `main` and reconcile affected
TODO/status/docs/wiki entries without editing the published wiki directly.

Preserve unique receipts outside temporary checkouts. After confirming all task work
is integrated, remove its local/remote branch and unused checkout. Keep `main`, active
work, failed-run evidence and any checkout still owned by another task. On Windows,
unlink junctions without following their targets.

## Release, maintenance and incident handling

The release coordinator follows [Releasing](docs/RELEASING.md) and
[Operations](docs/OPERATIONS.md), using one clean revision and exact image. The
handoff includes CI/security receipts, image identity, migration inventory,
SBOM/notices, install/upgrade/backup/restore evidence, release notes and the
[open acceptance record](docs/ACCEPTANCE_EXECUTION.md). Review the
[dependency exceptions](docs/DEPENDENCY_REVIEW.md), including their expiry and scope,
before each release and during dependency triage. An expired exception needs a
resolution or fresh review, not an automatic deadline extension.

Record the release coordinator, reviewer and key custodian, plus the exact intended
platform/support scope. Keep candidate preparation separate from public publication:
without trusted key custody, prepare an explicitly unsigned evaluation candidate.
The custodian signs offline and distributes the public-key fingerprint independently,
as the release guide describes. Never put a private key in Git, CI, issue attachments
or a handover document. A temporary test key cannot become the publisher identity.
Only the steward or an explicitly authorized release maintainer publishes a release.

Open pilot gates stay in the release notes. A short endurance smoke cannot close FR01:
it requires an exact-revision receipt with `passed=true`, `full72Hours=true` and at
least 72 actual workload hours. Hardware acceptance needs its named equipment and
reviewer. See [factory readiness](docs/FACTORY_READINESS.md) and the acceptance record.
Do not change, stop or rebuild a healthy running qualification to validate another task.

For a regression or suspected incident, record the revision, impact and owned
reproduction; preserve bounded, sanitized logs and database/spool evidence. Hold
affected release claims while the cause is unresolved. Use the documented isolated
backup/restore rehearsal before recommending a recovery. Revert code through a PR
where safe; do not erase data, reverse a published migration blindly or delete a spool.
Security reports use the private process; exposed credentials must be rotated by
their custodian. Publish only sanitized findings and supported remedies.

## Bring in another maintainer

An interested contributor can request a bounded subsystem role through a discussion.
Useful evidence is a complete contribution, constructive reviews and familiarity with
the relevant tests, data boundaries and release limits. There is no automatic promotion
by commit count and no requirement to receive signing or administrative access.

The steward and candidate agree on responsibilities, availability and exclusions.
Record consent and scope publicly without personal contact or recovery details.
Grant the minimum repository permissions needed through the repository's access
settings, and update `CODEOWNERS` and the responsibilities above through a PR.
Use individual accounts and protected authentication; never share a maintainer account.

Before considering the handover complete, the incoming maintainer performs this rehearsal:

1. Use a fresh checkout and follow the setup guide with owned fixtures; run both builds,
   type checks and the checks for the chosen subsystem.
2. Take a small issue from reproduction through a PR; record the exact source revision,
   checks and limitations. Review another change, or rehearse a review with the steward
   if no live change is available.
3. Locate a failed CI receipt and explain which acceptance gate remains open. Show how
   evidence survives cleanup and how the ordinary merge/rollback path works.
4. For a release role, rehearse unsigned package preparation and isolated recovery using
   the release/operations guides. Actual signing requires the separate custody handoff.

Record the date, participants, scope, PR/receipt links, unresolved questions and accepted
responsibilities in the handover discussion. Only then describe that scope as independently
maintained. A simulated walkthrough or this document's publication alone does not establish it.

For a planned absence, record who covers open work and releases. If no authorized
backup exists, state that releases may pause. Existing authorized maintainers can
continue within their scope; nobody gains access or key custody by assuming the role.
For departure or inactivity, preserve work and evidence, agree on a successor where
possible, remove unnecessary access through the current repository administrator,
update ownership records and rotate affected credentials through their custodians.
If the sole administrator is unavailable, public fixes can still be proposed, but
this handbook cannot grant access or authorize publication under their identity.
