# Edge sites and central history (H08, E03, E04)

Each site runs its own installation (an **edge**) with its own collector, database and
users. The edge keeps working on its own. A **central** installation, running the same
image, receives the edges' committed measurements for cross-site views. Nothing is sent
from the central installation to machines.

## Enroll an edge

1. On the central installation: **Settings → Edges → Create edge**, with a name and a
   site. The one-time enrollment code is shown once and is valid for 24 hours.
2. On the edge: **Settings → Edges → Link to a central installation**. Enter:
   - the central URL (HTTPS);
   - the central server's CA certificate (PEM), which is the only CA the edge trusts for
     that link;
   - the enrollment code.

The returned token is stored sealed with the edge's secret key (`MACHINE_SECRETS_KEY_FILE`).
The central installation stores only its hash. Enrollment is audited on both sides.

## What is sent and when it counts as stored

- **What:** the edge's collector sends committed rows of `opcua_data`, in id order, in
  batches of `batchSize` rows (default `EDGE_SYNC_BATCH_SIZE`). It sends one batch every
  `EDGE_SYNC_INTERVAL_MS`, and the next one at once while more are waiting.
- **Settle horizon:** a row is sent only once its id is at or below an id recorded at
  least `EDGE_SETTLE_MS` earlier (default 30 s). Writes still open at that moment can
  commit first.
  - *Limit:* a measurement transaction open longer than the horizon could be skipped.
    The collector's writes take milliseconds.
- **What stays local:** rows without a machine (the single `.env` connection).
- **Not sent:** corrections, reports, configuration and operator records.
- **Central side:** the central installation checks the token and the schema version
  (accepted: 1). Every edge machine becomes its own central machine at the edge's site,
  so equal machine numbers or addresses at two sites never collide. These machines are
  inactive and never connected.
- **Stored once:** rows are stored in one transaction under the identity
  `edge<id>:<event id>` and then acknowledged. The edge moves its cursor only to the
  acknowledged position. A lost response, a crash before the cursor update, a restart or
  a re-enrollment therefore resends rows, and the central installation stores none of
  them twice.
- **Refused whole:** an invalid batch (unknown schema, undeclared machine, a row beyond
  the cursor or a malformed row) stores nothing.
- **Retention:** on an edge, retention keeps every reading the central installation has
  not yet confirmed.
- **Reports:** central shift reports for an edge machine need that machine to be
  commissioned centrally. The site overview shows the edge's definition digest.

## Central outage

The edge keeps collecting, storing and showing its own data. It records the error,
retries with backoff (up to 5 minutes) and catches up afterwards without gaps or
duplicates.

## Site overview (E03)

**Daily operations → Sites** lists each edge site with machines the account may see.
For each site it shows:

- availability, last contact, last confirmed batch, the end of its data and the readings
  waiting at the site;
- per machine, the newest reading and the production definition digest. A digest
  shared with other machines is marked comparable.

A site is *offline* after three sync intervals without contact, and never sooner than
2 minutes. A site that is not online is marked as not current. Values after its data end
are unknown here, never zero.

## Lifecycle (E04)

| Step | How | Attribution |
| --- | --- | --- |
| Rotate credentials | **New enrollment code**; on the edge, remove the link and enroll again. The new token replaces the old one, which is refused from then on. The edge resends from the start; nothing is stored twice. | `edge.enrollment_issued`, `edge.enrolled`, `edge.link.*` |
| Revoke | **Revoke**. The edge is answered 401 and keeps its data. To rejoin, create a new edge. | `edge.revoked` |
| Configuration | **Publish configuration** creates an append-only revision with settings. The edge applies a revision only if it supports the schema (1) and every setting (`syncIntervalSeconds` 5–3600, `batchSize` 50–5000). Otherwise it rejects the revision and keeps the last applied one. Both outcomes appear on the central side. Anything else, such as a machine command, is rejected. | `edge.config_revision` |
| Staged upgrade | **Stage upgrade** records a target version. The edge reports what it runs (`SOURCE_REVISION`, set by the image build). | `edge.target_version` |

The upgrade itself is the [operations upgrade](OPERATIONS.md#upgrade), run at the site.
It takes a verified backup, changes the image and checks health. A failed upgrade stops
the app with its data intact.

- **Stop path:** clear the target version and do not upgrade the remaining edges.
- **Rollback path:** restore the checkpoint with the previous image.

Upgrade one edge first, check its link status and the central overview, then continue.

## Evidence and limits

`scripts/test-edge-history.mjs` runs the central installation behind an HTTPS front with
a pinned CA, plus two edge server processes with their own owned databases. It covers:

- enrollment, including a wrong CA and a reused code;
- convergence, with equal machine numbers kept apart by site;
- bad-quality samples arriving as bad;
- a lost acknowledgment;
- refused schema, malformed, beyond-cursor and undeclared-machine batches;
- replay acknowledgment and token rotation;
- configuration applied, and rejected (unsupported schema, machine command);
- batches of 50;
- a staged version;
- a central outage with local service and catch-up;
- the offline overview for a site-restricted viewer, in the browser;
- a crash and restart;
- re-enrollment;
- revocation with local data kept and protected from retention;
- audit records;
- edge creation in the browser.

Not covered:

- real site networks, link quality and latency;
- high availability of the central installation (D08);
- automatic fleet upgrades.

The settle horizon is a documented shortcut.
