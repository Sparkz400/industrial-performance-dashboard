# High availability (D08)

The pilot has no agreed recovery objectives yet (ROADMAP "Recovery objectives", P01/D06).
This design therefore separates the three concerns and states what is measured. It also
labels what is assumed. Only collector fencing is built, because a second active collector
is the one failure that silently corrupts history. Everything else stays restore-based
until a measured drill misses an agreed target.

## Three separate concerns

| Concern | Today | Measured or tested | Next step only if a target is missed |
| --- | --- | --- | --- |
| **Database recovery** | Verified backups and restore into a fresh project ([operations](OPERATIONS.md)). The spool keeps collecting through a database outage. | `test-operations.mjs`: backup, restore, failed-upgrade rollback. Spool limit 1,000,000 samples (`OPCUA_SPOOL_MAX_ENTRIES`), about 2.8 h at 100 tags × 1 Hz ([capacity](CAPACITY.md)). | PostgreSQL streaming replication with *manual* promotion. Automatic promotion needs its own fencing and is not proposed. |
| **Web redundancy** | One app process serves the browser and collects. Sessions live in PostgreSQL, so a second process can serve sign-ins. | `test-collector-fencing.mjs`: a second process on the same database starts, serves and waits for the collector lease. | A second web process behind the site's reverse proxy. It never collects while the first holds the lease. |
| **Collector ownership** | A session advisory lock on a dedicated connection, a lease epoch per acquisition, and fencing at the write. | `test-collector-lock.mjs` and `test-collector-fencing.mjs` (below). | — |

## Collector fencing

- **Lease:** every acquisition of the collector lock records a lease (`collector_epochs`:
  epoch, holder, acquisition time). The holder is the host, the process and a random
  suffix. Every spooled sample carries the lease it was taken under.
- **Check:** before a batch is written, a sample is checked against later leases. If a
  newer lease held by a *different* collector began before the sample was received, the
  sample is quarantined with the reason `Fenced: …`. It is not stored, and it is not
  deleted.
  - *Case:* a collector cut off from the database keeps spooling while another takes
    over. Its later samples would duplicate the new holder's.
- **Not fenced:**
  - samples taken before the takeover;
  - a collector's own backlog after it restarts or retakes its own lock (same holder);
  - legacy samples without a lease.
- **Takeover:** when the holder dies, its database session ends and the lock is free. A
  waiting process takes it within its retry interval (5 s), opens a new lease and
  connects to the machines. Readings during the gap were never received; that time stays
  unknown.
  - The dead holder's unwritten spool stays on its host. Restarting that host's app
    writes the samples taken before the takeover and quarantines anything later.

Evidence, `scripts/test-collector-fencing.mjs`, against an owned database:

1. The fencing rule in-process. A retake by the same holder keeps its backlog. A sample
   received before another collector's lease is stored; one received after it is
   quarantined with the fencing reason.
2. A declared topology: two app processes on one host, one owned database, one owned OPC UA
   server publishing a value every 100 ms.
   - The second process waits without a lease while the first collects.
   - `kill -9` of the first hands the lease to the second, which continues collecting.
   - No source timestamp is stored twice.

## Assumptions (to be replaced by agreed targets)

- **A1:** A host loss loses the samples still in that host's spool. The spool is on the
  collector's disk.
- **A2:** Clocks of collector hosts and the database are synchronised (NTP) to well under
  a second. Fencing compares a sample's receive time with the start of a newer lease.
- **A3:** The database is a single instance. Its loss means restoring the latest backup,
  so history after that backup is lost unless it is still in a spool.
- **A4:** One installation per database. A second installation with a *different*
  database cannot be detected; that remains procedural.

## Residual limits

- The fencing check reads the leases just before the insert, not in the same
  transaction. A lease taken within those milliseconds is not seen by that one batch.
- Automatic web failover, database replication and cross-host failover are not built or
  tested.
- No recovery target has been agreed or measured against. The D06 restore drill on
  the pilot hardware remains the trigger for anything more.
