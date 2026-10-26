# Dependency PR disposition — 2026-10-26

All 29 open proposals were reviewed against the current root-workspace project.
Compatible changes are consolidated in [PR #40](https://github.com/Sparkz400/performance_dashboard/pull/40) so one dependency
set can be installed and tested together. Original bot branches are retained as
review provenance when their commits were not merged verbatim.

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

## Security residuals and ownership

The local runtime-only npm audit reports **zero advisories**. The full audit
reports **seven moderate package findings**, stemming from two development-only
advisories: [esbuild development-server access](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
through drizzle-kit, and [UUID behavior](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
through Storybook addon-actions. Proposed npm fixes downgrade whole toolchains;
they are not applied blindly. Do not expose development/Storybook/database tooling
to untrusted networks. Repository maintainers own these residuals under F09;
review supported upstream migrations and rerun audits for each release.

Container/Chromium advisories and code scanning are separate gates, reported by
the current-image workflow. This record does not accept an image for production.
See [P0 acceptance](P0_ACCEPTANCE.md) and [TODO](../TODO.md).
