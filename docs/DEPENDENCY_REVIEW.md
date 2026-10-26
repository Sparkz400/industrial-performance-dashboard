# Dependency PR disposition — 2026-10-26

All 29 open proposals were reviewed against the current root-workspace project.
Compatible changes are consolidated in [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40) so one dependency
set can be installed and tested together. Closed pull-request history preserves
proposal provenance even when GitHub removes the original bot branches.

Dependabot generated replacement Node 26 proposal #41 during cleanup. Its two
Docker stage changes were reviewed and declined for the same reason as #29.
Docker major updates are now excluded from automatic proposals while Node 24 is
the declared runtime; minor/patch updates remain enabled. A major runtime change
requires the explicit support decision and validation tracked under F09.

New PR #42 updated the pinned Gitleaks action to v3 (Node 24 action runtime,
unchanged inputs/outputs). Its single-line change and release notes were reviewed;
all required checks passed on `4c500941c151198466489bba8794fbc319f147c3` before merge.

| PR | Disposition |
| --- | --- |
| [#1](https://github.com/Sparkz400/performance_dashboard/pull/1) | The Docker login action was used only by the removed preview workflow. Current workflows do not call docker/login-action, so this obsolete patch has no target. |
| [#3](https://github.com/Sparkz400/performance_dashboard/pull/3) | The current CI and security workflows already use actions/upload-artifact v7 with a pinned commit. This older v7 proposal is superseded by main. |
| [#6](https://github.com/Sparkz400/performance_dashboard/pull/6) | The github-script usage targeted by this PR was removed with the old preview/CI implementation. Current workflows contain no github-script step. |
| [#8](https://github.com/Sparkz400/performance_dashboard/pull/8) | Defer the MUI 6 to 7 migration: existing Grid2 imports and associated components require coordinated API and browser validation. The P0 work retains one consistent MUI 6 family. Tracked in TODO F09's dependency follow-up. |
| [#12](https://github.com/Sparkz400/performance_dashboard/pull/12) | Defer the coordinated lint major migration. Installed eslint-plugin-react 7.37.5 supports ESLint through ^9.7, not 10. Retain ESLint 9 until the plugin/config migration is compatible and validated. Tracked in TODO F09. |
| [#13](https://github.com/Sparkz400/performance_dashboard/pull/13) | Do not install React Window 2 typings over the retained react-window 1.8 runtime. Runtime, types and virtualization callers must migrate together. Tracked in TODO F09. |
| [#14](https://github.com/Sparkz400/performance_dashboard/pull/14) | Consolidated into this change and superseded after integration. |
| [#15](https://github.com/Sparkz400/performance_dashboard/pull/15) | Defer react-grid-layout 2 until dashboard persistence, drag/resize behavior and API/type changes can be migrated together. This P0 wave retains the tested v1 layout contract. Tracked in TODO F09. |
| [#16](https://github.com/Sparkz400/performance_dashboard/pull/16) | This updates only @storybook/react to 10 while storybook, addons, blocks and the Vite adapter remain 8. Defer the family migration together with Vite compatibility. Tracked in TODO F09. |
| [#17](https://github.com/Sparkz400/performance_dashboard/pull/17) | The installed @storybook/react-vite 8.6.18 declares Vite ^4 || ^5 || ^6. Vite 8 alone is incompatible; coordinate the Storybook/Vite migration. Tracked in TODO F09. |
| [#18](https://github.com/Sparkz400/performance_dashboard/pull/18) | Consolidated into this change and superseded after integration. |
| [#19](https://github.com/Sparkz400/performance_dashboard/pull/19) | Consolidated into this change and superseded after integration. |
| [#20](https://github.com/Sparkz400/performance_dashboard/pull/20) | This upgrades only the Storybook Vite adapter to 10 while the remaining Storybook packages remain 8. Coordinate the entire family and Vite upgrade. Tracked in TODO F09. |
| [#21](https://github.com/Sparkz400/performance_dashboard/pull/21) | Defer AutoSizer 2 with the coordinated React Window virtualization migration so the sizing contract and actual list rendering can be tested together. Tracked in TODO F09. |
| [#23](https://github.com/Sparkz400/performance_dashboard/pull/23) | Consolidated into this change and superseded after integration. |
| [#24](https://github.com/Sparkz400/performance_dashboard/pull/24) | Consolidated into this change and superseded after integration. |
| [#25](https://github.com/Sparkz400/performance_dashboard/pull/25) | Consolidated into this change and superseded after integration. |
| [#26](https://github.com/Sparkz400/performance_dashboard/pull/26) | Consolidated into this change and superseded after integration. |
| [#29](https://github.com/Sparkz400/performance_dashboard/pull/29) | The repository explicitly supports and tests Node.js 24 (.nvmrc, AGENTS.md, CI and Docker). Keep the runtime consistent; a Node 26 migration needs a separate support decision and complete validation. Tracked in TODO F09. |
| [#30](https://github.com/Sparkz400/performance_dashboard/pull/30) | Consolidated into this change and superseded after integration. |
| [#31](https://github.com/Sparkz400/performance_dashboard/pull/31) | Consolidated into this change and superseded after integration. |
| [#32](https://github.com/Sparkz400/performance_dashboard/pull/32) | Consolidated into this change and superseded after integration. |
| [#33](https://github.com/Sparkz400/performance_dashboard/pull/33) | Consolidated into this change and superseded after integration. |
| [#34](https://github.com/Sparkz400/performance_dashboard/pull/34) | Consolidated into this change and superseded after integration. |
| [#35](https://github.com/Sparkz400/performance_dashboard/pull/35) | eslint-plugin-react 7.37.5 declares support through ESLint ^9.7, not 10; an isolated ESLint 10 bump cannot form a supported dependency set. Track the coordinated lint migration in TODO F09. |
| [#36](https://github.com/Sparkz400/performance_dashboard/pull/36) | This bumps Vitest to 5 without moving its matching @vitest/coverage-v8 peer. The current consolidation keeps Vitest and coverage on the same v4 release; a v5 migration is deferred in TODO F09. |
| [#37](https://github.com/Sparkz400/performance_dashboard/pull/37) | Consolidated into this change and superseded after integration. |
| [#38](https://github.com/Sparkz400/performance_dashboard/pull/38) | Consolidated into this change and superseded after integration. |
| [#39](https://github.com/Sparkz400/performance_dashboard/pull/39) | This upgrades MUI icons to 9 while Material and System stay on 6. Retain a consistent MUI family and migrate components together, tracked in TODO F09. |

## Consolidation details

- PR 32 is subsumed by the newer PostgreSQL instrumentation in PR 34. OpenTelemetry API 1.10/resources and metrics SDK 3 are aligned with SDK Node/exporters 0.300, removing invalid peer dependencies. A real loopback span export verifies startup and shutdown.
- PR 33 becomes Vitest 4.1.12 with the matching coverage provider. PR 36's isolated v5 upgrade is not applied.
- PRs 23–26 are included through the regenerated root lock: YAML 2.9.1 (and 1.10.3 where required), patched picomatch, socket.io-parser 4.2.7 and flatted 3.4.4.
- PRs 30/31 use their exact pinned setup-node and Trivy action commits. Node 24 remains the supported application runtime.
- PR 34 is applied to current manifests without reverting earlier security fixes. The scheduler uses node-cron's exported ScheduledTask type. npm's old-lock resolver crashed, so the root workspace lock was resolved from the current manifests and validated with a clean install; no legacy-peer-deps or force flag is required.
- Future major proposals group MUI, Storybook/Vite, lint, Vitest/coverage and virtualization families so coupled changes can be reviewed together.

## Security follow-up — PR #51

The full npm audit now reports **zero vulnerabilities**, including development
packages. Root overrides apply UUID 11.1.1 only to Storybook addon-actions, and
esbuild 0.25.12 only to the deprecated Drizzle loader. This fixes
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) and
[GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) without
changing the retained Storybook/Vite or Drizzle APIs. Remove these overrides when
upstream toolchain migrations supply compatible patched dependencies.

Validation includes clean install/peer validation, both builds, Storybook build,
Drizzle generation with no schema changes, the real loader's sync/async TypeScript
transforms, UUID undersized-buffer rejection, 194 unit tests, type/lint/format
checks and the isolated production browser/simulator workflow. Security CI blocks
all npm advisory severities, including development dependencies.

CodeQL's CSRF finding is fixed with an explicit session-token equality check before
the shared CSRF middleware. Tests reject missing, wrong and other-session tokens
across REST/tRPC. Socket handshakes reject foreign browser origins, and CSRF error
logs reveal only token presence, never token values or session IDs. No finding is
silenced with a CodeQL suppression.

## Container findings and release gate

A fresh Node 24/Debian trixie/Chromium image with package upgrades was scanned using
Trivy 0.76.1 on 2026-10-26. Local content digest:
`sha256:4a564ea38e85633a993588d3fbf3ee6d00aff4fb224642f03c7a917c2038b3c4`.
It contains the PR #51 application changes and patched npm lockfile. Hosted reports
record their own exact commit and image identity; do not reuse this digest as
proof for a later build.

**413 findings remain: 1 critical, 66 high, 157 medium, 183 low, 6 unknown.**
None lists an available fixed package. The critical
[libxml2 CVE-2026-6653](https://security-tracker.debian.org/tracker/CVE-2026-6653)
remains unfixed in stable Debian. These findings are not dismissed, suppressed or
accepted for production. Repository maintainers own reassessment and mitigation
before a release; rebuild and inspect the report for each candidate. Keep the
installation isolated from untrusted inputs while the release gate is open.

A Wolfi/Node 24 candidate passed application startup, migrations, login, PostgreSQL,
native modules and PDF rendering, but its available Chromium 149 package produced
1,655 findings (34 critical, 471 high). Both the starter and public Wolfi package
indexes offered that older browser. The candidate was rejected; replacing the
base did not safely resolve the browser exposure. No unverified binary or unstable
Debian package was substituted to hide the findings.

The retained Debian image passes SQLite, bcrypt, OPC UA import, scheduler, offline
email, OpenTelemetry startup/shutdown and real Chromium PDF checks. An isolated
container check also covers fresh PostgreSQL migrations/seed, served frontend,
login/session persistence, database health, user 1000 and IANA timezone support.

Container CI now runs on PRs/main and weekly, builds with a fresh base, preserves
full JSON/SARIF plus image identity, and blocks **fixable** high/critical findings.
The complete unfiltered report still appears in GitHub code scanning. A successful
fixable-finding gate does not approve the unfixed risks. See
[P0 acceptance](P0_ACCEPTANCE.md) and [TODO F09](../TODO.md).
