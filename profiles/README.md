# Machine-profile catalog

These are reviewed starting mappings, not plug-and-play equipment certifications.
The catalog describes the transport, equipment/firmware scope, qualification,
evidence and limitations separately from each importable profile.

| Profile | Qualification | Scope |
| --- | --- | --- |
| [Owned factory replay](owned-factory.json) | Simulator | Four synthetic production signals; independent shift ledger, gaps, bad quality and rejected resets |
| [Owned legacy gateway](owned-legacy.json) | Simulator | Owned Modbus fixture offsets 0–6, exposed through the legacy gateway; not a vendor map |
| [Owned Boolean running state](owned-boolean-state.json) | Simulator | One Boolean state signal: true/1 running, false/0 idle; stale and BadNoCommunication intervals stay unknown |
| [Owned 16-bit rollover](owned-rollover.json) | Simulator | UInt16 counters with `counterPolicy: rollover` and an explicit `counterModulus` of 65536 |

Download a profile JSON file, then use **Production → Commissioning → Import profile**.
Review its node identities, scale, units, state meanings, maximum gap, counter policy
and cycle standard. Import only previews the fields; commissioning and its read-only
checks still determine whether it can be saved for the selected machine.
For the legacy profile also follow the [gateway recipe](../docs/LEGACY_GATEWAY.md).

## Worked review: owned-factory.json

A field-by-field reading of [owned-factory.json](owned-factory.json). Labels in
bold are the **Commission machine** form fields that import fills; JSON names come
from the [profile schema](../server/src/services/productionProfile.ts).

| JSON field | Value in this profile | What to check |
| --- | --- | --- |
| `version`, `name`, `endpointModel` (**Profile name**, **Machine model / supported version**) | `1`, `Synthetic factory demo`, `Owned replay simulator v1; not a vendor map` | Only version 1 exists. The model text is an operator declaration, not verified compatibility. |
| `signals.<role>.nodeKey` (**key**) | `ProductionState`, `ProductionCount`, `GoodCount`, `RejectCount` | The stored signal alias; the four roles need distinct keys. |
| `namespaceUri` + `identifier` (**namespace URI**, **identifier**) | `urn:performance-dashboard:factory-demo:v1` with `s=ProductionState` etc. | The stable identity. The URI, not a namespace index, is stored; preview resolves it to `ns=<index>;<identifier>` on the selected endpoint and fails if the endpoint does not publish that URI. Identifiers start with `i=`, `s=`, `g=` or `b=`. |
| `dataType` (**type**) | `Int32` for all four | Must equal the scalar type the endpoint reports; preview marks a mismatch as not ready. Allowed: Boolean, Byte, SByte, Int16, UInt16, Int32, UInt32, Float, Double. |
| `unit`, `scale` (**unit**, **scale**) | state `null`/`1`; counters `parts`/`1` | Values are multiplied by `scale` (a state value is scaled before it is matched to a state meaning). The unit is declared text, not converted. |
| `states` (**running/idle/fault/planned values**) | running `1`, idle `0`, fault `2`, planned `3` | Must match the machine's own state codes; a value may belong to only one meaning and at least one running value is required. Any other value is unknown time. |
| `maxGapSeconds` (**Unknown after (seconds)**) | `20` | Longer than the collection heartbeat (ten seconds). After this a state becomes unknown and a counter pair is incomplete. Range 1–300. |
| `idealCycleMs` (**Ideal cycle (milliseconds)**) | `2000` | One part per two running seconds; drives performance. Use the product's agreed cycle standard, not this demo value. |
| `counterPolicy` (**Counter decreases**) | `reject-decrease` (**Mark as incomplete**) | A decrease is discarded and the counter marked incomplete. Use `reset-to-zero` or `rollover` (with `counterModulus`) only when the machine documents that behavior. |

This profile has no live endpoint: [factory-scenario.mjs](../scripts/factory-scenario.mjs)
writes stored samples for a replay machine. Importing it does not change any
machine; it fills the form after server validation. Saving still requires a
selected machine, a **Preview mapped signals** check in which every signal is
Good, of the declared type and numeric, and the review checkbox. Saving checks the
endpoint again and stores a new profile revision.

For a different endpoint, change at least the namespace URI and identifier of
every signal to what that server publishes, the data types, scale/unit, the state
codes, the ideal cycle, the maximum gap and the counter policy (plus modulus).
Edit `name` and `endpointModel` to describe the real model; never add endpoint
addresses or credentials to the profile. The connection belongs to the machine.

This entry's qualification is `simulator` (see the levels below): it was only
exercised against owned replay fixtures. A changed copy that works on equipment is
at most `reported` until a named reviewer accepts physical evidence for
`physically-verified`, and either level covers only that model and firmware.

## Boolean running state and 16-bit rollover

[`owned-boolean-state.json`](owned-boolean-state.json) maps a single Boolean `state`
signal. The spool stores `true` as `1` and `false` as `0`, so the state meanings are
numeric: `running: [1]`, `idle: [0]`, and `fault`/`planned` stay empty. One Boolean
cannot tell a fault from planned downtime or a stopped-but-ready machine, so that time
is never inferred: classify stops with reasons, or map a richer state signal. The
profile has no counters, so quantities and OEE stay unknown until you add them.

[`owned-rollover.json`](owned-rollover.json) keeps the factory layout but reads UInt16
counters with `counterPolicy: "rollover"` and `counterModulus: 65536`. The modulus is
your explicit statement about the equipment's counter width: the dashboard never
infers a wrap from a decreasing value, and with `reject-decrease` the same decrease
leaves the interval incomplete. Confirm the width and wrap behavior with the
responsible engineer before using it.

[`scripts/test-profile-catalog.mjs`](../scripts/test-profile-catalog.mjs) replays both
through the real spool normalization and shift calculation, without a database, and
checks independently specified results for a 60-second shift with a 20-second maximum gap:

| Replay | Expected |
| --- | --- |
| Boolean: `true` at 0 and 10 s, `false` at 20 and 30 s, `BadNoCommunication` at 55 s | 20 s running, 30 s idle (the 30 s sample goes stale after 50 s), 10 s unknown, no fault or planned time, OEE unknown |
| Rollover: total and good 65530 → 65533 → 65535 → 1 → 4, rejects 0, running throughout | 10 total, 10 good, 0 rejects, availability 1, performance 1/3, quality 1, `verified: true` |
| Rollover with a `BadNoCommunication` total at the 65535 sample | Total not completed across the gap, performance/quality/OEE `null`, `verified: false` |

Both entries are `simulator` only: stored-sample replay, not live OPC UA transport,
a PLC or physical acceptance. The published benchmark cases are unchanged.

## Contribute

1. Add a plain version-1 production profile in this directory and an entry in
   [catalog.json](catalog.json). Use stable lowercase IDs and filenames.
2. Name the exact model, firmware/version and tested scope. Include limitations
   and a repository-relative, sanitized evidence/test file that a reviewer can inspect.
3. Remove credentials, endpoints containing user information, actual plant names,
   certificate material, personal information and site-identifying measurements.
   The validator rejects extra schema keys and common credential patterns; a
   maintainer must still review free-text content and permissions to share it.
4. Add a reproducible fixture/test with expected state/counter/OEE results. Include
   reset/rollover semantics, units and missing/bad-quality behavior where applicable.
5. Run `npm run build:server`, then `npm run profiles:check`, and the relevant owned
   simulator test. Open a pull request with the evidence and exact support limits.

Validation reuses the application's production-profile schema and semantic checks.
It rejects duplicate IDs, unknown metadata, malformed mappings, missing evidence
files and paths escaping the repository (including symlinks). No connector code is
downloaded or executed from catalog entries.

Qualification levels:

- **simulator:** exercised only against owned simulation/replay fixtures. This is
  the level of every currently published entry.
- **reported:** a contributor reports compatibility; maintainers have not physically
  verified it. Include the sanitized report and exact scope.
- **physically-verified:** a named reviewer has accepted evidence from the stated
  equipment/firmware, including test date, permitted scope and failures/limitations.
  `reviewer` and `testedOn` are required. Automated schema checks cannot establish
  physical acceptance; maintainers must review that evidence before merging the claim.

Qualification is scoped to that entry/version. It does not establish compatibility
with a whole vendor family, later firmware, a production installation or its operators.
