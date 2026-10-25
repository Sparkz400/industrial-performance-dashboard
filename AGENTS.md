# Working on Performance Dashboard

- Use Node.js 24, npm workspaces and the root package-lock.json.
- Read callers and shared types before changing an API shape. Preserve numeric
  chart compatibility while retaining raw measurements and quality metadata.
- Treat missing data as unknown. Do not invent production, downtime or perfect
  quality from missing samples. Counter resets and time boundaries need tests.
- Never acknowledge buffered measurements before durable storage, or delete a
  spool before PostgreSQL confirms the write. Replays must be idempotent.
- Use isolated databases and owned simulators. Never attach to production
  machines, reset existing credentials or erase user data as part of a test.
- Run the relevant tests, both builds and type checks; use actual browser flows
  for UI changes. Keep hardware qualification separate from automated evidence.
- Keep README and docs/wiki overviews in sync with setup, architecture and status.
  Use absolute GitHub file links in wiki pages. Never edit the wiki directly.
- Keep secrets, logs, databases, certificate keys and generated builds out of Git.
- Keep main and active work. Remove task branches and unused worktrees only after
  integration and preservation of unique work and evidence.
