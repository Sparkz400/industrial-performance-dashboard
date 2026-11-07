# Find a contribution

Start with one bounded issue, then follow [Contributing](../CONTRIBUTING.md).
The initial set below was inspected against `4b13bb7f` on 2026-10-31. Each issue
contains the current gap/reproduction, source files, parent TODO IDs, completion
criteria, validation and exclusions. Recheck current `main` before changing code.

Use [open good first issues](https://github.com/Sparkz400/industrial-performance-dashboard/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)
for a smaller starting point, or [open help wanted issues](https://github.com/Sparkz400/industrial-performance-dashboard/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22)
for the full contribution list. GitHub is the live status/assignment record; this
page is an index, not a second issue-status checklist.

All twelve issues in this initial set were completed in
[PR #22](https://github.com/Sparkz400/industrial-performance-dashboard/pull/22)
(2026-11-07); the table is kept as a record of finished examples. New bounded issues
are published with the same structure and labels; until then, ask in a discussion
before starting larger TODO work.

| Issue | Parent TODO area | Contribution |
| --- | --- | --- |
| [#9](https://github.com/Sparkz400/industrial-performance-dashboard/issues/9) | P02, U07 | German interactive-demo walkthrough |
| [#10](https://github.com/Sparkz400/industrial-performance-dashboard/issues/10) | H03, U02, P03 | Short glossary for unknown, stale and verified data |
| [#11](https://github.com/Sparkz400/industrial-performance-dashboard/issues/11) | C04, P03 | Worked review of an existing profile import |
| [#12](https://github.com/Sparkz400/industrial-performance-dashboard/issues/12) | P02, P03 | Two real synthetic-demo screenshots with captions and alt text |
| [#13](https://github.com/Sparkz400/industrial-performance-dashboard/issues/13) | U06 | Reusable manual-accessibility observation template |
| [#14](https://github.com/Sparkz400/industrial-performance-dashboard/issues/14) | I02 | Useful plain-text rate-limit errors in the example client |
| [#15](https://github.com/Sparkz400/industrial-performance-dashboard/issues/15) | F10, O09 | External-file CLI tests for the correctness comparator |
| [#16](https://github.com/Sparkz400/industrial-performance-dashboard/issues/16) | C04, C10 | Catalog containment tests with existing files and directory links |
| [#17](https://github.com/Sparkz400/industrial-performance-dashboard/issues/17) | R04, P03 | One downloadable synthetic shift-evidence example |
| [#18](https://github.com/Sparkz400/industrial-performance-dashboard/issues/18) | C04, C10 | Simulator-only Boolean running-state profile and replay |
| [#19](https://github.com/Sparkz400/industrial-performance-dashboard/issues/19) | C04, C10 | Simulator-only 16-bit rollover profile and replay |
| [#20](https://github.com/Sparkz400/industrial-performance-dashboard/issues/20) | R04, U07 | German offline evidence-verification guide |

## Work through one issue

1. Read the issue and check for an assignee, open PR or recent activity. Comment
   before starting so contributors can avoid overlapping work. The two profile
   examples share catalog/test files; coordinate those edits and preserve both entries.
2. Use the smallest change that satisfies its checklist. Raise an unexpected scope
   increase in the issue instead of silently adding a new subsystem.
3. Use Node.js 24 and the root npm workspace lockfile. Documentation work can start
   with the linked files; if changing commands, verify them. Runtime fixtures need
   owned simulators and isolated databases, never production connections or user-data resets.
4. In the PR, link the issue with `Closes #NUMBER` only when its full checklist is
   met; otherwise use `Refs #NUMBER` and list what remains. Include exact commands,
   results, source revision and any untested Windows/Linux or human-review boundary.
5. Follow the [maintainer handbook](../MAINTAINERS.md) for review and handover. Do
   not post credentials, identifying plant data, private keys or vulnerability
   details. Use the [private security process](../SECURITY.md) for the latter.

An issue is a contribution to a TODO area, not its entire acceptance definition.
Some parent software scopes are already implemented; these issues add a bounded
example, explanation or regression. Other parents still need physical/operator
evidence. Closing an issue does not close its parent's wider gate or change the
[acceptance record](ACCEPTANCE_EXECUTION.md) without the required evidence.
No issue reserves an assignee, promises a response time or grants maintainer access.
