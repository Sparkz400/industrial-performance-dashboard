# Contributing

Start with the [README](README.md) and [current status](docs/STATUS.md). Open a
discussion before a substantial feature or architecture change. Prefer a small,
complete change with a reproducible example over another unfinished subsystem.

## Setup and validation

Use Node.js 24 and the root `package-lock.json`. Run `npm ci` from the repository
root; client, server and shared types are npm workspaces. Do not create workspace
lockfiles or commit generated builds, credentials, certificates or customer data.
Follow [Getting started](docs/GETTING_STARTED.md) for a fresh database and simulator.

```sh
npm run build
npx tsc --noEmit -p client/tsconfig.json
npm run lint
npm run format:check -w client
npm run test:coverage
npx playwright install chromium
npm run test:e2e
```

Browser tests read the local password from `server/.env`, or `E2E_USERNAME` and
`E2E_PASSWORD` from the environment. Use an isolated development database. Tests
must clean up the records they create and fail when an expected UI action is absent.

Add focused regression tests for data interpretation, reconnects, authentication,
authorization and persistence. Check real PostgreSQL writes when changing the
measurement schema. Generate migrations with `npm run db:generate -w server` and
test `npm run db:migrate -w server` against a fresh database. Never replace a
published migration or run destructive schema pushes against someone else's data.

## Pull requests

Target `main`. Explain the problem, resulting behavior, commands run and remaining
limits. Keep source, shared types, tests and affected documentation consistent.
An OPC UA simulator test is not physical-machine qualification. Avoid claiming
universal compatibility, compliance certification or production readiness.

`docs/wiki/` is the source for the GitHub wiki. Update it alongside setup,
architecture or status changes; direct wiki edits are overwritten by publishing.

Contributions are under Apache-2.0. Submit only code and data you have permission
to share. Follow the [code of conduct](CODE_OF_CONDUCT.md).
