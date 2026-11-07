# Data-quality glossary

Short definitions of the words a shift report, wallboard or evidence bundle uses
when data is incomplete. The rules come from
[shiftCalculation.ts](../server/src/services/shiftCalculation.ts); the
[production workflow](PRODUCTION_WORKFLOW.md), [shift evidence](SHIFT_EVIDENCE.md)
and [correctness benchmark](../benchmarks/correctness/README.md) give the context.

## Terms

**Observed.** A sample the calculator can use: Good quality, a finite value from
the mapped signal identity (namespace URI and identifier), no older than the
profile's maximum gap. A state sample counts only if its scaled value appears in
the profile's state meanings. A counter delta needs two usable readings inside the
shift, at most the maximum gap apart. *Observed seconds* are the shift length minus
unknown seconds.

**Missing / unknown.** No usable observation. State time without one is `unknown`;
it is listed as "Unknown data", not counted as downtime, and makes availability and
OEE unknown. A quantity or factor without enough input is `null`. Unknown is never
zero, a stopped machine, perfect quality or invented production.

**Numeric zero.** A real observation. A Good counter reading that did not change
between two usable samples is a measured delta of 0. A sum of observed deltas is
still not the shift's production when coverage is incomplete (see the examples).

**Stale.** A value older than the profile's maximum gap (**Unknown after
(seconds)** in commissioning, `maxGapSeconds` in the profile). After that the last
value no longer describes the machine, so the time becomes unknown rather than
keeping the last state. Live views show stale, bad, future-dated or disconnected
signals as unknown ([operator workflow](OPERATOR_WORKFLOW.md)).

**Non-Good quality.** A source status code that does not start with `Good` (for
example `BadNoCommunication` or an `Uncertain` code). The raw value is kept as
evidence, but it supplies no state, breaks the counter pair around it and makes
the counter incomplete. A source or acquisition time more than five minutes after
reception also gets bad effective quality ([data integrity](DATA_INTEGRITY.md)).

**Planned time.** Time excluded from the schedule: a planned break, the profile's
`planned` state, or an idle/fault interval classified with a planned reason.
`scheduledSeconds` is the shift length minus planned time. Running during an
excluded break withholds performance and OEE until the schedule is corrected.

**Counter reset versus rollover.** Both are a counter decrease; the profile's
counter policy decides how it is read.

- `reject-decrease` (**Mark as incomplete**): the decrease is discarded and the
  counter is incomplete. Benchmark `unapproved-reset`: observed 14/11/3
  (total/good/reject); performance, quality and OEE `null`.
- `reset-to-zero` (**Declared reset to zero**): the reading after the decrease is
  counted as new parts. Benchmark `approved-reset`: 16/12/4, OEE 0.4.
- `rollover` (**Declared counter rollover**) with `counterModulus`: a wrap from at
  least 90 % to at most 10 % of the modulus counts `modulus - previous + current`.
  Benchmark `rollover` (modulus 100): 15/13/2.

**Source time versus receive time.** Source time is when the device or publisher
says the value was observed (OPC UA source timestamp, the MQTT timestamp pointer, a
Sparkplug metric timestamp). Receive time is when this installation received it.
Both are stored separately; device clocks are not assumed to be synchronized, and
legacy rows without receive time keep an unknown clock status
([incident replay](INCIDENT_REPLAY.md)).

**`verified`.** `true` only when the report has no issues: the shift has ended,
state coverage is complete, every stop has a reason, all three counters are
complete, total equals good plus reject, no factor exceeds 100 %, no manual state
or quantity declaration was used, and an administrator recorded independent
total/good/reject counts that match. It is the calculator's internal
reconciliation. It does not authenticate who published the data or an evidence
bundle (`authenticated: false`), and it does not qualify a machine or installation.

## Examples from the published benchmark

Values are from [expected.json](../benchmarks/correctness/v1/expected.json).
Both are 60-second synthetic shifts with a 2,000 ms ideal cycle and a 20-second
maximum gap.

**`known-shift`.** 30 s running and 30 s fault, no unknown time. Counters observe
15 total, 13 good, 2 reject. Availability 30/60 = 0.5, performance 15 × 2 s / 30 s
= 1, quality 13/15 ≈ 0.8667, OEE 13/30 ≈ 0.4333. The independent count of 15 parts
matches, so `verified` is `true`.

**`missing-counter-reading`.** The same state (30 s running, 30 s fault), so
availability stays 0.5. The total counter has a 30-second gap, longer than the
20-second limit, so only its 0→7 and 15→15 deltas are observed: total 7 (the
15→15 delta is a real zero). Good and reject stay 13 and 2. Seven is observed
increments, not the shift's production: performance, quality and OEE are `null`,
and `verified` is `false`.

For contrast, `bad-quality` ends with 0/0/0 observed parts and every factor
`null`: zero observed increments do not show that nothing was produced.
