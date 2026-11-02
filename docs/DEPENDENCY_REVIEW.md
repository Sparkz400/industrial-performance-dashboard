# Dependency PR disposition — 2026-10-26

## Predecessor proposals — 2026-11-02

The six remaining proposals from `performance_dashboard` are handled in the
replacement repository. The original review records and clean branch heads are
preserved in the maintainer's private migration backup.

| Old PR | Disposition |
| --- | --- |
| #114 | Adopt Wolfi digest `fd50bd0cdeb808cf4f45c9c9189e0cc7f7fcc27195d69abd6622c80527e7e021`; retain Node 24, native x86/ARM runtime checks and the full image security scan. |
| #116 | Adopt Framer Motion 14.9.0. Existing motion elements, presence transitions and reduced-motion configuration remain in use; validate the actual dashboard/browser flows. |
| #117 | Adopt commitlint CLI 21.2.4, matching config-conventional. The existing CLI regression checks valid and invalid commit messages on Windows and Linux. |
| #118 | Adopt concurrently 10.0.6. Root build and test commands exercise the installed CLI with the existing Node 24 workspace commands. |
| #119 | Adopt ioredis 6.0.0 with explicit `protocol: 2` in both the cache and health probe, preserving compatibility with existing Redis servers. A health-probe regression rejects a connection that would require RESP3's `HELLO`. |
| #121 | Decline the isolated PostgreSQL 18 base-image bump. Keep PostgreSQL 16: the Compose mount, installation tools, offline packages, backup/restore and CI fixtures use its data layout. Major proposals are held until an explicit data migration and rollback procedure is tested; PostgreSQL 16 updates and vulnerability scanning continue. |

Upstream references: [Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide),
[ioredis 6 release notes](https://github.com/redis/ioredis/releases/tag/v6.0.0),
and [PostgreSQL image data-directory requirements](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata).
No existing database is upgraded or reset by this review. PostgreSQL 18 support is
not a prerequisite for retiring the predecessor repository.

## Replacement repository review — 2026-11-02

The five initial Dependabot proposals in `industrial-performance-dashboard` are
handled together, with the operator-history race exposed by CI.

| Proposal | Disposition |
| --- | --- |
| [#1](https://github.com/Sparkz400/industrial-performance-dashboard/pull/1) | Adopt dotenv 18.0.9. Existing `dotenv/config` imports and explicit quiet configuration remain in use. No vault or removed preloading API is used. |
| [#2](https://github.com/Sparkz400/industrial-performance-dashboard/pull/2) | Adopt react-resizable 4.0.2 for the direct stylesheet import. React Grid Layout retains its own compatible 3.2.0 runtime dependency; no override forces its major version. |
| [#3](https://github.com/Sparkz400/industrial-performance-dashboard/pull/3) | Remove the unused Twilio SDK instead of upgrading it. No application or test caller imports it; the retired SMS integration is not restored. |
| [#4](https://github.com/Sparkz400/industrial-performance-dashboard/pull/4) | Adopt express-rate-limit 8.7.2 with the existing PostgreSQL login stores and default IP key handling. |
| [#5](https://github.com/Sparkz400/industrial-performance-dashboard/pull/5) | Replace TypeScript 7 with supported TypeScript 6.0.3. typescript-eslint 8.72.1 requires TypeScript below 6.1, and the compiler-policy regression still uses the classic compiler API. Remove the deprecated client `baseUrl` and retain the alias through a relative `paths` target. |
| [#7](https://github.com/Sparkz400/industrial-performance-dashboard/pull/7) | Adopt Undici 8.12.3. The outbound request helper retains connection-time DNS validation, private-address rejection, redirect refusal and its response-size limit; the existing ten security regressions exercise the installed client. |

Dependabot continues to update TypeScript 6. TypeScript 7 proposals are held until
the lint parser supports that major and the compiler-policy checks can migrate
without losing their rejected/safe examples. This does not suppress vulnerability
scanning. See the [typescript-eslint support policy](https://github.com/typescript-eslint/typescript-eslint/blob/v8.72.1/docs/users/Dependency_Versions.mdx),
[resizable changelog](https://github.com/react-grid-layout/react-resizable/blob/master/CHANGELOG.md)
and [rate-limit changelog](https://github.com/express-rate-limit/express-rate-limit/blob/main/docs/reference/changelog.mdx).

The operator-history query now includes the saved entry version. Opening history
while a save is pending can no longer leave the previous revision cached. The
browser regression pauses the save, opens the old history, then requires the new
revision after the save completes. The session type augmentation explicitly imports
its base module, so the client-side tRPC type check also works with TypeScript 6's
explicit ambient-type discovery.

Local validation passes clean installation and peer checks, both builds, client
types, all 477 unit tests, lint/compiler-policy and developer-tool regressions,
lint/format and the isolated PostgreSQL/browser production workflow. The full npm
audit has zero advisories. Hosted CI additionally covers Linux/Windows, four browser
suites, the production container and the secure deployment setup.

## Maintenance review — 2026-11-02

The six November proposals were reviewed together against `1c380dc5` and the
supported Node 24 runtime. Five are consolidated without changing application
APIs. The Node 26 declaration proposal is replaced with Node 24 declarations.

| Proposal | Disposition |
| --- | --- |
| [#107](https://github.com/Sparkz400/performance_dashboard/pull/107) | Adopt the pinned Wolfi base digest `88a20e2d017bd20cdc0cb3910de603e7bea9512a6c351a8dd3c9df212ab03d73`; retain Node 24 and require the actual-image checks. |
| [#108](https://github.com/Sparkz400/performance_dashboard/pull/108) | Adopt the nine grouped minor/patch updates. tRPC client, React Query adapter and server stay together at 11.22.1. The OPC UA package remains subject to the guarded overflow patch and its regression. |
| [#109](https://github.com/Sparkz400/performance_dashboard/pull/109) | Adopt jsdom 30.1.3 for client tests, matching the existing server major. Its Node 24 minimum is 24.15.0; validation uses 24.22.1. |
| [#110](https://github.com/Sparkz400/performance_dashboard/pull/110) | Adopt config-conventional 21.2.4 with the existing commitlint CLI 20.5.3. The real CLI accepts a valid message and rejects an invalid one with the installed configuration. |
| [#111](https://github.com/Sparkz400/performance_dashboard/pull/111) | Decline Node 26 declarations. Replace the previous Node 25 declarations with `@types/node` 24.19.2 at the root and server; root placement keeps client/build tooling on the same declarations. Dependabot still updates this supported major, but no longer proposes automatic major changes. This does not change the Node runtime. |
| [#112](https://github.com/Sparkz400/performance_dashboard/pull/112) | Adopt lint-staged 17.6.0. The pre-commit hook uses `--hide-unstaged` so tasks see staged content and restore private work afterward. An owned Git fixture verifies partial staging, unrelated unstaged work and the resulting index. |

The review uses the upstream [lint-staged staging contract](https://github.com/lint-staged/lint-staged#--hide-unstaged),
[commitlint configuration](https://github.com/conventional-changelog/commitlint/tree/master/%40commitlint/config-conventional),
[jsdom runtime requirement](https://github.com/jsdom/jsdom/blob/main/package.json)
and [DefinitelyTyped version policy](https://github.com/DefinitelyTyped/DefinitelyTyped#how-do-definitely-typed-package-versions-relate-to-versions-of-the-corresponding-library).
The hook regressions extend `test-dev-dependencies.mjs`, which already runs on
Windows and Linux CI. No production credentials, databases or machines are used.

The full npm audit reports zero advisories, including development dependencies;
the removed minimatch exception is not reinstated. The failed November 1
[endurance attempt](FACTORY_READINESS.md#latest-sustained-attempt--2026-11-01)
is separate evidence: these updates do not close FR01 or any physical/publisher gate.

## Exception removed and upstream follow-through — 2026-10-31

The December 1 minimatch exception is removed, not extended. A clean root install
and full `npm audit --json` report zero findings, including development packages.
`check-dependency-audit.mjs` now accepts only a complete zero-advisory report; it
rejects the formerly excepted advisory, malformed reports and every severity.
CI retains the raw report. These results describe this dependency set and scan date,
not a promise about future advisories.

The registry still publishes `eslint-plugin-react` 7.37.5 with ESLint peers only
through 9 and a callable minimatch 3 dependency. The coordinated replacement uses
ESLint 10.14.0, `@eslint/js` 10.0.1, `@eslint-react/eslint-plugin` 5.28.8,
React Hooks 7.1.1, JSDoc 65.4.2 and the security plugin 4.2.1. All installed matcher
copies are minimatch 11.0.3. `npm ls --all` passes without forced/ignored peers.
Production dependency versions are unchanged. The existing modern-matcher override
remains because some callers still request a vulnerable v10 range.

The migration follows the [ESLint 10 guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0)
and [React rule comparison](https://eslint-react.xyz/docs/migrating-from-eslint-plugin-react).
Only the existing React/Hooks policies are enabled; unrelated compiler/style presets
are not added. JSX keys, names, comment text, children, unsafe links/HTML, DOM
properties, deprecated lifecycles/APIs and state mutation retain lint checks.
Unescaped JSX text uses a core selector. Duplicate props, unknown components,
string refs, `isMounted` and missing class-render returns are enforced by TypeScript;
the automatic JSX runtime needs no `React` import solely to render JSX.
`scripts/test-lint-policy.mjs` exercises rejected and safe examples against the
actual config/compiler, including security rules and JSDoc. The JSON parse fallback
keeps its sanitized CSRF error without retaining a parser error containing response text.

Upstream OPC UA remains separate. The latest npm release is 2.187.18; master was
[`7b9b1df`](https://github.com/node-opcua/node-opcua/commit/7b9b1df922074deb3166186d5cb7b608278e31da).
A clean, unmodified installation still fails the overflow regression on Uncertain
quality. The existing guarded two-assertion removal passes all eight quality/discard
combinations against that release. [Upstream issue #1849](https://github.com/node-opcua/node-opcua/issues/1849)
contains the self-contained reproduction, versions, sanitized stack and proposed fix.
The upstream contribution guide asks for issue discussion before a code contribution;
this is a report/proposal, not an accepted upstream fix or full upstream-suite result.
Keep the pinned, hash-checked local patch until an official release passes the
unmodified regression. A version bump to 2.187.18 alone would not remove it.

Validation: clean `npm ci`, dependency-tree validation, full audit, strict audit
regressions, lint-policy/compiler fixtures, both builds and type checks, unit coverage,
lint/format, Storybook and the existing development/OPC UA checks. Hosted CI also
requires Windows/Linux, browser/database, container and security checks. Simulator
evidence does not close FR01, physical acceptance or publisher-key custody.

## Earlier security refresh — 2026-10-31 (superseded)

The earlier zero-advisory receipts below are historical. The fresh audit of
`3286ab94` reported 20 affected packages from three advisories, not 20 independent
vulnerabilities. This wave updates Joi to 18.3.1, overrides the development glob
to 14.0.3 and modern minimatch copies to 11.0.3. Glob's public APIs, Storybook,
lint/type checks and builds are exercised. The JSDoc/security lint plugins now
belong to development dependencies. The server/shared production audit is clean. The community
workflow change also raises the manifest's minimum from `^18.3.0` to `^18.3.1`:
the lockfile already contained the patched 18.3.1, so the installed dependency
set does not change. This aligns the declared range with
[GHSA-4528-x5fx-h6hg](https://github.com/advisories/GHSA-4528-x5fx-h6hg).

The raw full audit retains 14 affected development-package rows, all flowing from
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
The advisory describes amplification in `firstPhasePreProcess` with
`optimizationLevel >= 2`. The remaining minimatch 3.1.5 source has neither that
preprocessor nor the optimization option. Its callable API is still required by
ESLint 9 and eslint-plugin-react; replacing it with the v11 export object breaks
those callers. This is a reviewed non-applicable finding, not a patched v3 claim.

At that checkpoint, `scripts/check-dependency-audit.mjs` accepted only that advisory for development-only
3.1.5 copies with the exact reviewed `minimatch.js` SHA-256
`746849f267c4868a53729225bd85c7dccd387712136fb305fcc0a3eadd4a3d9d`.
It rejected changed source/version/scope, malformed reports, any other advisory and
use of the exception on or after **2026-12-01**. The migration above removes this
exception and its deadline entirely; this paragraph preserves the prior decision.

The remaining sections preserve the dated dependency migrations and image receipts.

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

| PR                                                                | Disposition                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1](https://github.com/Sparkz400/performance_dashboard/pull/1)   | The Docker login action was used only by the removed preview workflow. Current workflows do not call docker/login-action, so this obsolete patch has no target.                                                               |
| [#3](https://github.com/Sparkz400/performance_dashboard/pull/3)   | The current CI and security workflows already use actions/upload-artifact v7 with a pinned commit. This older v7 proposal is superseded by main.                                                                              |
| [#6](https://github.com/Sparkz400/performance_dashboard/pull/6)   | The github-script usage targeted by this PR was removed with the old preview/CI implementation. Current workflows contain no github-script step.                                                                              |
| [#8](https://github.com/Sparkz400/performance_dashboard/pull/8)   | Defer the MUI 6 to 7 migration: existing Grid2 imports and associated components require coordinated API and browser validation. The P0 work retains one consistent MUI 6 family. Tracked in TODO F09's dependency follow-up. |
| [#12](https://github.com/Sparkz400/performance_dashboard/pull/12) | Defer the coordinated lint major migration. Installed eslint-plugin-react 7.37.5 supports ESLint through ^9.7, not 10. Retain ESLint 9 until the plugin/config migration is compatible and validated. Tracked in TODO F09.    |
| [#13](https://github.com/Sparkz400/performance_dashboard/pull/13) | Do not install React Window 2 typings over the retained react-window 1.8 runtime. Runtime, types and virtualization callers must migrate together. Tracked in TODO F09.                                                       |
| [#14](https://github.com/Sparkz400/performance_dashboard/pull/14) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#15](https://github.com/Sparkz400/performance_dashboard/pull/15) | Defer react-grid-layout 2 until dashboard persistence, drag/resize behavior and API/type changes can be migrated together. This P0 wave retains the tested v1 layout contract. Tracked in TODO F09.                           |
| [#16](https://github.com/Sparkz400/performance_dashboard/pull/16) | This updates only @storybook/react to 10 while storybook, addons, blocks and the Vite adapter remain 8. Defer the family migration together with Vite compatibility. Tracked in TODO F09.                                     |
| [#17](https://github.com/Sparkz400/performance_dashboard/pull/17) | The installed @storybook/react-vite 8.6.18 declares Vite ^4                                                                                                                                                                   |     | ^5  |     | ^6. Vite 8 alone is incompatible; coordinate the Storybook/Vite migration. Tracked in TODO F09. |
| [#18](https://github.com/Sparkz400/performance_dashboard/pull/18) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#19](https://github.com/Sparkz400/performance_dashboard/pull/19) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#20](https://github.com/Sparkz400/performance_dashboard/pull/20) | This upgrades only the Storybook Vite adapter to 10 while the remaining Storybook packages remain 8. Coordinate the entire family and Vite upgrade. Tracked in TODO F09.                                                      |
| [#21](https://github.com/Sparkz400/performance_dashboard/pull/21) | Defer AutoSizer 2 with the coordinated React Window virtualization migration so the sizing contract and actual list rendering can be tested together. Tracked in TODO F09.                                                    |
| [#23](https://github.com/Sparkz400/performance_dashboard/pull/23) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#24](https://github.com/Sparkz400/performance_dashboard/pull/24) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#25](https://github.com/Sparkz400/performance_dashboard/pull/25) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#26](https://github.com/Sparkz400/performance_dashboard/pull/26) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#29](https://github.com/Sparkz400/performance_dashboard/pull/29) | The repository explicitly supports and tests Node.js 24 (.nvmrc, AGENTS.md, CI and Docker). Keep the runtime consistent; a Node 26 migration needs a separate support decision and complete validation. Tracked in TODO F09.  |
| [#30](https://github.com/Sparkz400/performance_dashboard/pull/30) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#31](https://github.com/Sparkz400/performance_dashboard/pull/31) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#32](https://github.com/Sparkz400/performance_dashboard/pull/32) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#33](https://github.com/Sparkz400/performance_dashboard/pull/33) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#34](https://github.com/Sparkz400/performance_dashboard/pull/34) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#35](https://github.com/Sparkz400/performance_dashboard/pull/35) | eslint-plugin-react 7.37.5 declares support through ESLint ^9.7, not 10; an isolated ESLint 10 bump cannot form a supported dependency set. Track the coordinated lint migration in TODO F09.                                 |
| [#36](https://github.com/Sparkz400/performance_dashboard/pull/36) | This bumps Vitest to 5 without moving its matching @vitest/coverage-v8 peer. The current consolidation keeps Vitest and coverage on the same v4 release; a v5 migration is deferred in TODO F09.                              |
| [#37](https://github.com/Sparkz400/performance_dashboard/pull/37) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#38](https://github.com/Sparkz400/performance_dashboard/pull/38) | Consolidated into this change and superseded after integration.                                                                                                                                                               |
| [#39](https://github.com/Sparkz400/performance_dashboard/pull/39) | This upgrades MUI icons to 9 while Material and System stay on 6. Retain a consistent MUI family and migrate components together, tracked in TODO F09.                                                                        |

## Additional major proposals reviewed during PR #51

These proposals are closed and their migrations remain tracked in TODO F09. They
are not needed to fix the two npm advisories, which PR #51 resolves with the tested
current toolchain. Reopen a migration when its callers and checks can move together.

| PR                                                                | Evidence and disposition                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#52](https://github.com/Sparkz400/performance_dashboard/pull/52) | MUI 9.5 changes the existing component/icon imports. Its CI build/browser failures include unresolved `@mui/icons-material/HelpOutline`; current code also imports `@mui/material/Grid2`. A component migration is required, not only three version bumps.                        |
| [#53](https://github.com/Sparkz400/performance_dashboard/pull/53) | Storybook 10.6/Vite 8.3 leaves the configured addon-essentials on 8.6, whose declared Storybook peer is `^8.6.14`. Earlier CI passed because it did not build Storybook. PR #51 adds that missing build check; migrate the addon configuration with the whole family.             |
| [#54](https://github.com/Sparkz400/performance_dashboard/pull/54) | ESLint 10 fails on both operating systems: `react/display-name` calls removed `contextOrFilename.getFilename`. Installed eslint-plugin-react supports ESLint through 9, so the plugin/config migration remains required.                                                          |
| [#55](https://github.com/Sparkz400/performance_dashboard/pull/55) | Vitest/coverage 5 are grouped correctly, but both type checks fail because Testing Library matcher declarations no longer augment the new assertion type (`toHaveValue`, `toBeVisible`, `toBeInTheDocument`). Keep the tested v4 pair until the test-type migration is qualified. |

## Coordinated major migrations — 2026-10-30

The families deferred above migrate one per commit in
[PR #81](https://github.com/Sparkz400/performance_dashboard/pull/81), so each can be reverted alone.
Every family's peers were checked against the registry first. ESLint is the only
family whose peers are still incompatible, and it was not forced.

| Family            | Result                                                                        | Decision and changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest + coverage | `vitest`/`@vitest/coverage-v8` 5.0.5, `@testing-library/jest-dom` 7.0.1       | Migrated. The #55 type failure came from Vitest 4's `JestAssertion` extending the global `jest.Matchers`, which Vitest 5 dropped. The client setup now imports `@testing-library/jest-dom/vitest`, which augments Vitest's `Assertion`. Vitest stays at the workspace root so those types resolve. Vitest 5 also reported an intermittent `EnvironmentTeardownError`: 15 server unit files imported the real database manager, which starts a PostgreSQL login to `DB_PORT` 5432 on import and could log after teardown. A shared stub in the server test setup keeps unit tests off real PostgreSQL.                                                                           |
| Storybook + Vite  | `storybook`, `@storybook/react`, `@storybook/react-vite` 10.6.5; `vite` 8.3.5 | Migrated. Controls, actions, backgrounds, viewport and toolbars are in Storybook 10 core. `addon-essentials` (#53's blocker) and `blocks` are removed because no story uses docs or MDX. Storybook loads `main.ts` as native ESM, so both configs use `import.meta.dirname`, and the Vitest config imports `vite.config.ts` with its extension for Vite 8's native config loader. `addon-actions` is no longer installed, so its scoped UUID override and check are removed.                                                                                                                                                                                                    |
| MUI               | `@mui/material`, `@mui/icons-material`, `@mui/system` 9.5.0                   | Migrated. There is no v8; the official v9 guide covers 7 → 9. The official `@mui/codemod` 9.5.0 transforms `v7.0.0/grid-props`, `v9.0.0/system-props` and `deprecations/all` were applied. `Grid2` imports become `@mui/material/Grid`. The six removed `*Outline` icons, including #52's unresolved `HelpOutline`, use their `*Outlined` names, and four `slotProps` entries move system props into `sx`. MUI 9 `Switch` exposes role `switch`, so two browser checks query that role. Runtime-only changes were reviewed: link, label and anchor buttons infer `nativeButton=false`; no `MenuItem` or `Tab` renders outside its container; no `Grid` uses a column direction. |
| ESLint            | `eslint` 9 (unchanged)                                                        | Kept on 9. `eslint-plugin-react` 7.37.5, still the latest release (2025-04-03), declares ESLint `^3 … ^9.7`, and #54 showed `react/display-name` calling the removed `getFilename` under ESLint 10. Revisit when the plugin supports ESLint 10, or when the lint config replaces it.                                                                                                                                                                                                                                                                                                                                                                                            |
| Virtualization    | `react-window` 2.5.1                                                          | Migrated. `VirtualizedTable` uses the v2 `List`, which sizes itself to its parent, so `react-virtualized-auto-sizer` and `@types/react-window` are removed (#13 and #21 are superseded). AutoSizer 1.x remains only as `@nivo/core`'s own dependency. The list keeps react-window 1's role-less container because its rows are MUI table rows. The unused `VirtualizeGrid` is deleted rather than migrated.                                                                                                                                                                                                                                                                     |
| Grid layout       | `react-grid-layout` 2.3.0                                                     | Migrated through the v2 `react-grid-layout/legacy` entry, which keeps the v1 props and the persisted layout contract. v2 ships its own types, so `@types/react-grid-layout` is removed. v2 passes read-only layouts to callbacks, so the dashboard copies the array before storing it. `react-resizable` stays on 3 because react-grid-layout 2.3 depends on `^3.2` and the dashboard imports its stylesheet.                                                                                                                                                                                                                                                                   |
| Node runtime      | Node 24 (unchanged)                                                           | Out of scope. Node 26 still needs the separate support decision recorded for #29.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Validation on Windows with Node 24.22: clean root `npm ci`; `npm ls --all` with no
invalid or missing peers; full `npm audit` at zero; both builds; client, Vite-config
and server type checks; lint (no errors, the seven earlier warnings remain), Prettier,
the dev-dependency check and 110 client and 318 server unit tests with coverage
(eight repeated server runs). The Storybook build renders all 21 stories in a browser,
including the theme toolbar, controls and the scrolled 1,000-row virtualized table.
The isolated Playwright suite passes 15 of 15. The accessibility check finds no WCAG
2.2 A/AA violations on 7 screens and moves and resizes a widget by keyboard. The
subscription-limit and daily-workflow browser flows pass. A real mouse drag and
handle resize of dashboard widgets is saved to an owned PostgreSQL database and
restored after reload. It stores the same layout as react-grid-layout 1.5.4 for the
same actions. All database checks used throwaway databases on the owned test
container. No production endpoint was used.

Follow-through on findings observed before the migration:

- Dashboard hydration no longer writes an old debounced snapshot back over the loaded
  dashboard, and comparison ignores generated layout constraints. The browser test
  checks that loading stays clean and moving/resizing still marks real edits unsaved.
  The earlier unfinished comparison and drag/resize regression are retained;
  reordered JSON object keys do not count as edits.
- Selectors render an empty list while their options load, avoiding missing-children
  warnings without inventing an option or selected value.
- Dashboard tabs support Delete by keyboard; the regression no longer depends on
  MUI's development-only icon test identifier.
- The wallboard warning came from a browser fixture supplying strings where typed
  issue records were required. The fixture now supplies IDs and checks the shared type.

Recovery follow-through adds a committed-writer boundary to edge cursors and a durable
PLC alarm spool. Their isolated regressions cover late commits, database rejection,
observer restart and exactly-once replay. The updated unit suite has 112 client and
319 server tests; [endurance evidence](FACTORY_READINESS.md#compiled-frontend-follow-up--2026-10-30)
records the compiled-frontend smoke separately from 72-hour acceptance.

Vite 8 also recommends `@vitejs/plugin-react` over `plugin-react-swc` when no SWC
plugins are used; that optional switch is not part of this migration.

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
upstream toolchain migrations supply compatible patched dependencies. The UUID
override was removed with the Storybook 10 migration, which no longer installs
addon-actions.

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

## Browser-free runtime migration — 2026-10-26

The Node 24/Wolfi runtime replaces the Debian/Chromium image. PDFKit renders the
existing trend, alarm and OEE reports directly with licensed embedded Noto Sans
fonts. The browser dependency and its system packages are removed from production;
Playwright remains a development-only browser test dependency. See the
[compatibility matrix, upgrade procedure and remaining limits](REPORTING.md).

The complete Trivy 0.76.1 scan reports **zero findings**, across **28 Wolfi packages
and 557 Node packages**. The full npm audit also reports zero at every severity,
including development dependencies. Scans are unfiltered: there is no ignore file,
`ignore-unfixed` switch, dismissed advisory or severity suppression. Fresh CI scans
record the source commit, image identity, complete package inventory and JSON/SARIF.
This is evidence for the scanned build and database date, not a promise about
future advisories or a replacement for the broader F09 boundary audit.

The local candidate's content digest is recorded below; hosted builds retain their
own image identity and must not borrow this result for a different image.
`sha256:b021d56f2a5a0dbb8e26a588ceb5850e534c1fdd5120b2453c3cfe75e9b08d34`.

Validation: 136 server and 67 client unit tests, both builds, client type/lint/format,
Storybook, Drizzle no-change generation and dev-tool compatibility checks. Twelve
existing browser flows and the extended production workflow pass. New reporting
checks cover template creation/editing and reload, machine/timezone settings,
manual and actual timer runs, browser history/download, invalid input and viewer
restrictions. PDFs were rendered and inspected against the old HTML renderer;
Unicode, all 200 alarm rows, long-cell continuation, footers and failure cleanup
are checked automatically. The SMTP service's attachment is verified in memory.

The actual Wolfi image passes SQLite/bcrypt, OPC UA certificate creation/read/live
subscription, OpenTelemetry startup/shutdown, PDF generation and email attachment
creation. Isolated container acceptance covers fresh/repeated migrations, seed,
frontend/login/session/health, user 1000, IANA timezones, automatic PDF download,
report-volume persistence across restart and forced-termination/database-outage
measurement replay. No production endpoint or external mail service was used.

Container CI runs on PRs/main and weekly and now blocks **all high/critical
findings, including those without fixes**. Full JSON/SARIF remains visible in code
scanning, with image identity retained as an artifact. Rebuild and rescan each
release candidate; passing automated checks does not establish physical-machine,
SMTP-provider, backup/restore or deployment acceptance.

The subsequent [factory-pilot candidate](FACTORY_PILOT_ACCEPTANCE.md), source
`5178ebd9`, also has zero npm/Trivy findings. Its inventory contains 28 Wolfi and
556 Node packages; unused node-cron was removed when durable scheduling replaced
the in-memory scheduler. The linked acceptance record identifies its own image
digest, runtime/upgrade tests and remaining physical/provider acceptance gates.

### Superseded image evidence

The previous PR #51 Node 24/Debian trixie/Chromium image
`sha256:4a564ea38e85633a993588d3fbf3ee6d00aff4fb224642f03c7a917c2038b3c4`
had 413 findings: 1 critical, 66 high, 157 medium, 183 low and 6 unknown, without
available fixed packages. A full Wolfi image with Chromium 149 had 1,655 findings
and was rejected. Those results remain historical evidence; they do not describe
the migrated browser-free runtime. None was dismissed to obtain the new result.

## OPC UA overflow patch

Current upstream status and reproduction: see the [2026-10-31 follow-through](#exception-removed-and-upstream-follow-through--2026-10-31)
and [upstream issue #1849](https://github.com/node-opcua/node-opcua/issues/1849).

`node-opcua-server` 2.187.16 asserts that notification queue overflow only occurs
for Good values. Uncertain/Bad quality (or existing status metadata) instead crashes
the server. The same assertions are present in the inspected 2.187.18 package.
`node scripts/patch-opcua.mjs` removes only the two invalid Good-only assertions;
the upstream status-bit handling and overflow diagnostic counter remain intact.

Root `npm ci` applies the patch through `postinstall`. Both Docker dependency
stages apply it explicitly after their script-disabled installs. For any other
`--ignore-scripts` install, run the patch explicitly. It accepts only the recorded
original or patched source digest, so an upstream change fails installation until
reviewed. Remove it when the upstream implementation passes
`node scripts/test-opcua-overflow.mjs` unmodified. That regression exercises both
discard policies, quality, metadata, timestamps and source-value preservation,
and also runs inside the production image's runtime smoke. This changes no
collector acceptance rule and does not turn missing notifications into measurements.
