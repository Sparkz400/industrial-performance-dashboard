# Interactive factory demo

The demo runs the actual dashboard against an isolated, persistent local database.
Its four-signal replay uses the [owned factory profile](../profiles/owned-factory.json).
All names and measurements are synthetic. It does not connect to a physical machine.

## Start

Install Node.js 24, Docker and the repository dependencies (`npm ci`). Start the
owned local PostgreSQL service once with `docker compose -f compose.local.yml up -d`.
From the repository root, run:

```sh
npm run demo
```

Open the local address printed in the terminal. The guide provides the generated
demo login, a direct shift link and scenario buttons. Both the guide and application
listen on `127.0.0.1` using available ports. No browser driver installation is needed
to use the demo. The first server build can take a minute.

### In GitHub Codespaces

[Open a codespace](https://codespaces.new/Sparkz400/performance_dashboard?quickstart=1).
The [development container](../.devcontainer/devcontainer.json) installs dependencies,
starts the owned database with Docker-in-Docker and runs `npm run demo` in a terminal.
Open the printed **Factory demo** address; Codespaces forwards each port privately to
your GitHub account. The demo serves the dashboard and its API from one forwarded
origin, and the guide accepts only its own forwarded address. Stop the codespace
when you are done; it uses your Codespaces quota.

The existing `server/.env` takes precedence over `.env.example`. The demo refuses a
database host other than localhost/127.0.0.1 or a port other than 55432. It creates a
random `pd_demo_…` database, with a matching ownership marker, on that local service.
It does not use or reset the application's normal database or account credentials.

## Try the guided cases

1. **Known shift:** 30 seconds running, 30 seconds stopped, 15 total parts,
   13 good, 2 rejected, a two-second ideal cycle and OEE **43.33%**. The source ledger
   is independent of the calculation. Classify the observed stop and review the report.
2. **Missing measurements:** a missing midpoint leaves a coverage gap. Affected
   counters and OEE remain unknown.
3. **Bad signal quality:** the midpoint is explicitly `BadNoCommunication`; it must
   not become a good observation.
4. **Counter reset:** decreasing counters are rejected by this profile. Choose a
   reset policy only when it matches the actual equipment's documented behavior.

Each button adds a fresh machine/shift without overwriting earlier edits. Up to
100 shifts are allowed before reset. The replay writes a fixed historical ledger;
it is not a live OPC UA transport test. Existing owned OPC UA/Modbus integration
tests cover their respective transport paths separately.

Use **Export reproducible evidence** on a shift and follow the
[offline evidence guide](SHIFT_EVIDENCE.md). Missing or bad data remains visible
after export. Profile contributions start in the [catalog](../profiles/README.md).

## Stop, resume and reset

Press Ctrl+C in the terminal. `npm run demo` resumes the same database and demo
login. Local credentials, certificates and runtime files live under
`.local/interactive-demo/`, which is ignored by Git. Keep that directory private.
Do not change the built-in demo account passwords unless you intend to reset it.

To erase this demo's database, stop it first and run:

```sh
npm run demo:reset
```

Reset requires the matching local ownership record and database marker. It refuses
a running demo, a mismatched marker or active database sessions; it never forces
sessions closed. The next start creates a fresh known shift. Local runtime files
and the generated login are retained. If a process crashed, startup removes its
lock only after checking that its recorded process no longer exists. A reused PID
can require waiting for that process to exit; do not kill unrelated processes.

The screenshot walkthrough remains available via `node scripts/demo-factory.mjs`.
It is a separate automated evidence generator, not the persistent interactive demo.

Validation: `node scripts/test-community-workflows.mjs` and
`node scripts/test-interactive-demo.mjs` check the independent totals, failure
cases, browser login/download, persistence, reset ownership and cross-origin refusal.
The first launch simulates Codespaces forwarding: the guide accepts only its own
forwarded host, and the proxied socket handshake accepts only the demo's forwarded
origin. A real codespace has not been run as part of automated validation.
