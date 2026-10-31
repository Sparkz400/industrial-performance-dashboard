# Find a contribution

Start with one bounded issue, then follow [Contributing](../CONTRIBUTING.md).
The initial set below was inspected against `4b13bb7f` on 2026-10-31. Each issue
contains the current gap/reproduction, source files, parent TODO IDs, completion
criteria, validation and exclusions. Recheck current `main` before changing code.

Use [open good first issues](https://github.com/Sparkz400/performance_dashboard/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22)
for a smaller starting point, or [open help wanted issues](https://github.com/Sparkz400/performance_dashboard/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22help%20wanted%22)
for the full contribution list. GitHub is the live status/assignment record; this
page is an index, not a second issue-status checklist.

| Issue | Parent TODO area | Contribution |
| --- | --- | --- |
| [#91](https://github.com/Sparkz400/performance_dashboard/issues/91) | P02, U07 | German interactive-demo walkthrough |
| [#92](https://github.com/Sparkz400/performance_dashboard/issues/92) | H03, U02, P03 | Short glossary for unknown, stale and verified data |
| [#93](https://github.com/Sparkz400/performance_dashboard/issues/93) | C04, P03 | Worked review of an existing profile import |
| [#94](https://github.com/Sparkz400/performance_dashboard/issues/94) | P02, P03 | Two real synthetic-demo screenshots with captions and alt text |
| [#95](https://github.com/Sparkz400/performance_dashboard/issues/95) | U06 | Reusable manual-accessibility observation template |
| [#96](https://github.com/Sparkz400/performance_dashboard/issues/96) | I02 | Useful plain-text rate-limit errors in the example client |
| [#97](https://github.com/Sparkz400/performance_dashboard/issues/97) | F10, O09 | External-file CLI tests for the correctness comparator |
| [#98](https://github.com/Sparkz400/performance_dashboard/issues/98) | C04, C10 | Catalog containment tests with existing files and directory links |
| [#99](https://github.com/Sparkz400/performance_dashboard/issues/99) | R04, P03 | One downloadable synthetic shift-evidence example |
| [#100](https://github.com/Sparkz400/performance_dashboard/issues/100) | C04, C10 | Simulator-only Boolean running-state profile and replay |
| [#101](https://github.com/Sparkz400/performance_dashboard/issues/101) | C04, C10 | Simulator-only 16-bit rollover profile and replay |
| [#102](https://github.com/Sparkz400/performance_dashboard/issues/102) | R04, U07 | German offline evidence-verification guide |

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
