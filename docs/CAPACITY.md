# Capacity evidence and pilot limits

The first recorded workload is a **synthetic storage/replay benchmark**, not a
PLC throughput qualification or a promise of sustained customer capacity.
Run `node scripts/test-operations.mjs IMAGE` to reproduce it in a disposable
container installation. Its `capacity.json` records hardware, runtime, workload,
timings, CPU, memory, storage and the stated exclusions.

On 2026-10-26, Node 24.22.1/Wolfi on Docker Desktop exposed an AMD Ryzen 7 9800X3D,
16 logical CPUs and about 30.1 GiB RAM. PostgreSQL was version 16 in a separate
container. The fixture had 100 tags representing one minute at 1 Hz (6,000 replay
samples), 200 concurrent incoming samples, 10 concurrent query clients making
50 trend queries, and a 1,000-row PDF export.

| Measurement | Final pilot image observed result |
| --- | ---: |
| Durably buffered replay samples | 6,000 in 31.72 seconds |
| Replay with incoming samples, queries and export | 1.58 seconds |
| Persisted rows | 6,200; no loss |
| Uncertain samples retained with null numeric projection | 64 |
| Trend query p95 | 441 ms |
| Receive-to-commit lag p95, including the initial buffered burst | 24.005 seconds |
| Incoming-sample commit lag p95 during replay | 527 ms |
| Allocated spool/WAL bytes | 6,004,240 |
| Sampled peak process RSS | 176 MiB |
| Process CPU during fixture | 1.54 s user + 0.62 s system |
| PostgreSQL database size | 12.2 MiB |
| Measurement table plus indexes | 2.4 MiB |

The benchmark also records receive-to-commit lag and allocated spool/WAL bytes.
This run used the [pilot image](FACTORY_PILOT_ACCEPTANCE.md); other owned host checks
were running concurrently. The earlier run buffered the same burst in 13.09 seconds
with query p95 491 ms. This variation is another reason to measure sustained load
on the intended installation instead of treating the burst as a capacity promise.
Use the receipt from the exact image being considered; later releases and hardware
can change these numbers. CPU and memory are process measurements, not the total
Docker/host footprint. Query clients are concurrent data requests, not a complete
browser soak test. The fixture excludes PLC/network latency and alarm evaluation.

Start an owned pilot with at most 100 scalar tags at one-second requested sampling,
10 dashboard clients and one scheduled export at a time, then measure before
expanding. These are conservative rehearsal limits, not a qualified production
envelope. The PLC owner must approve subscription load and counter/state sampling
against the actual process. Sub-second events and resets between samples remain
unknown unless the source exposes retained evidence.

Watch received-data age, commit lag, pending queue depth, free disk reserve,
connection state and query p95 during the pilot. The spool refuses acceptance when
its reserve is exhausted rather than acknowledging lost data. Size storage for the
required outage window and tested backup/restore duration. A rising queue or stale
signal requires investigation; a successful reconnect does not reconstruct missed
measurements.

## Daily historian follow-through

The daily workflow test streams 200,000 raw rows while queries and ingestion continue
for at least one minute. The final local run completed 176 reads and 176 new rows in
64.967 seconds with query p95 531 ms. Retention then removed reviewed batches while
retaining 180,000 good summary samples, bad-quality counts and late arrivals.
See [daily acceptance](DAILY_OPERATIONS_ACCEPTANCE.md) for reproduction and limits.
Storage forecasting uses measured row bytes and receipt rate; it does not infer free
disk or future index/compression overhead. Protected shift/service evidence can prevent
retention from reclaiming all old data.
