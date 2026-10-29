# Research decisions — 2026-10-29

Baseline: `main` at `9709db99`. These decisions use repository evidence and primary sources only. No server, container, database, PLC or customer was used. Sources were consulted on 2026-10-29. Quotes are limited to one short quote per source.

They follow the ROADMAP's "Decisions that remain conditional" defaults: OPC UA plus qualified gateways, PostgreSQL plus the spool, one company per installation, and descriptive analytics before prediction. They also follow the RESEARCH "Unknowns" table.

| Item | Decision | TODO | One-line reason |
| --- | --- | --- | --- |
| C07 | DEFER (keep Modbus TCP 03/04 as the only provisional adapter) | Open | Ranking needs the P01 device inventory |
| A07 | DEFER (feasible, trigger defined) | Open | Owned-server demonstration not done; the pilot's alarm configuration and value are unknown |
| D08 | DEFER | Open | No recovery targets yet; the spool already rides through database outages |
| I08 | REJECT packaging; the extension boundary is a read-only OPC UA server | Close as rejected | Both adapters already meet at OPC UA; no need for a loader or marketplace |
| E06 | REJECT hosted tenancy | Close as rejected | Zero demand; the authorization model is single-company by design |
| X02 | REJECT | Close as rejected | No labeled incidents; the Done text prescribes rejection |
| X04 | DEFER | Open | No completed-run history to backtest |
| X06 | DEFER | Open | A ranked loss list exists; the usefulness comparison needs users; M06 is open |
| C06 | DEFER | Open | No MQTT source; C05 is open; Sparkplug host duties conflict with read-only operation |
| H08 | DEFER | Open | No multi-site customer; I01 is open; identities are not site-qualified |
| E02 | DEFER | Open | No selected IdP |
| P01 | Guide and hypotheses drafted | Open | Needs an operator, an engineer and a production lead |
| P06 | Baseline protocol drafted | Open | Needs P01 and the D06 pilot |

---

## C07 — Select one brownfield protocol extension

**Question.** Should Modbus RTU, MTConnect or a vendor gateway be added beside the existing Modbus TCP adapter?

**Current evidence.**
- `docs/LEGACY_GATEWAY.md` and `server/src/gateway/{modbusRead,legacyGateway,configuredGateway}.ts` provide read-only Modbus TCP 03/04. Values are exposed as encrypted OPC UA on 127.0.0.1.
- `modbusRead.test.ts` covers word order, signedness and timeouts.
- `docs/COMPATIBILITY.md` lists simulator evidence only.
- TODO C05/C07 blocker: no pilot inventory (P01).
- `docs/S7_1500_PILOT.md`: the nominated S7-1500 uses its native OPC UA server.

**External evidence.**
- [Modbus TCP implementation guide](https://www.modbus.org/file/secure/messagingimplementationguide.pdf): the MBAP Unit Identifier exists for routing through TCP-to-serial gateways. The existing adapter already validates the unit ID.
- [MTConnect model](https://model.mtconnect.org/Version2.2/Glossary/semanticdatamodel/) (S15). Agent restart and sequence semantics were not verified here; verify them against the pilot agent's version.

**Options considered.**
1. Native Modbus RTU (serial port, container device access).
2. RTU through an approved RTU-to-TCP gateway, reusing the current adapter.
3. MTConnect agent adapter (HTTP, sequence/instance resets).
4. Vendor gateway that exposes OPC UA (zero code; compatibility entry only).
5. Nothing new.

**Decision: DEFER. Keep the item open.**
- Blocker (unchanged): the P01 inventory of a nominated line, with protocol, firmware, permitted poll load and an owner.
- Ranking rule to apply once the inventory exists:
  - First, native OPC UA or a vendor gateway that exposes OPC UA (option 4).
  - Second, Modbus TCP, already provided.
  - Third, serial devices via option 2 before option 1.
  - MTConnect only if the inventory names CNC machines with an agent and no OPC UA. It needs agent-restart and sequence-gap fixtures.
- Document unsupported devices in COMPATIBILITY.md.

**Smallest build if triggered.**
- Option 2: no code. Add a gateway recipe to `docs/LEGACY_GATEWAY.md`, a unit-ID fixture in `modbusRead.test.ts` and a COMPATIBILITY entry.
- MTConnect: one adapter in `server/src/gateway/`, following the OPC UA exposure pattern. Fixtures cover instance change, sequence gap, UNAVAILABLE becoming bad quality, and unit scaling.

---

## A07 — Evaluate OPC UA Alarms and Conditions ingestion

**Question.** Can the dashboard observe PLC alarms (ProDiag, Program_Alarm) read-only, with source identity, refresh after reconnect and severity mapping?

**Current evidence.**
- Alarms today are threshold rules over sampled values, evaluated after the PostgreSQL insert (`server/src/services/alarmService.ts`, `server/src/queue/opcuaQueueWorker.ts`).
- `server/src/opc-ua/opcuaClient.ts` has no event subscriptions.
- The spool accepts only scalar values (`measurementSpool.ts`).
- Dependencies A01 and C02 are done.
- `docs/S7_1500_PILOT.md` says the dashboard "does not … call methods". ConditionRefresh is a method call, so this needs an explicit, documented exception.

**External evidence.**

[S7-1500 Communication Function Manual 11/2025, §11.3.6](https://support.industry.siemens.com/cs/attachments/59192925/s71500_communication_function_manual_en-US_en-US.pdf). Requirements: "S7-1500 CPU firmware version V2.9 or higher." The manual also documents:
- Requires an OPC UA runtime licence and central alarm management.
- Sources: ProDiag, system diagnostics, Program_Alarm, GRAPH.
- Priority 0–16 maps to Severity 1–1000 (table given).
- Fields include EventId, ConditionId, alarm number `3:ID`, ActiveState, AckedState, Retain.
- ConditionRefresh is supported (not ConditionRefresh2); where-filter depth is 1.
- A CPU option lets *any* client acknowledge alarms.
- Whether a reader needs "Call" permission for ConditionRefresh: **unknown**.

[OPC UA Part 9 §4.5](https://reference.opcfoundation.org/Core/Part9/v105/docs/4.5): "A Client receiving this special Event should initiate a ConditionRefresh".

node-opcua 2.187.16 (installed) has `constructEventFilter`, `callConditionRefresh` and `installAlarmMonitoring`. The [helper](https://github.com/node-opcua/node-opcua/blob/master/packages/node-opcua-client/source/alarms_and_conditions/client_alarm_tools.ts) filters `ofType(AcknowledgeableConditionType)`, drops events without a ConditionId (losing "information only" events) and leaves RefreshRequired as a TODO.

**Options considered.** Use the helper as-is; write a custom filter and refresh handler; or do nothing.

**Decision: DEFER. Keep the item open.** Trigger: P01 confirms all four of the following.
1. The CPU runs FW ≥ V2.9 with A&C enabled and licensed.
2. Program_Alarm or ProDiag alarms are configured for the nominated machine.
3. Users say PLC alarm texts would help classify stops.
4. The PLC owner grants Receive-events (and Call, if needed) permission, and the read-only exception for ConditionRefresh is approved.

The owned-server half needs no hardware, but has no value until conditions 2 and 3 hold.

**Smallest build when triggered.**
- One event item on Server with a custom select clause and a single-level where clause.
- An append-only `plc_alarm_events` table keyed by `(machine, EventId)`, storing ConditionId, `3:ID`, both times, Severity, states and Message.
- ConditionRefresh on connect, reconnect and RefreshRequired, with RefreshStart/End suspect handling. Never call Acknowledge or AddComment.
- Fixture (node-opcua server, `instantiateAlarmCondition`): reconnect refresh, duplicate EventId, severity table, information-only events.

---

## D08 — Design high availability from measured needs

**Question.** Should high availability (HA) be built before the pilot has recovery point/time objectives (RPO/RTO)?

**Current evidence.** "One active collector" is enforced only by procedure:
- `docs/OPERATIONS.md:58` and `:112` ("Stop the original collector…").
- The `scripts/operate.mjs:602` message and `docs/STATUS.md:121`.
- No lock in `server/src/queue/` or `opc-ua/`. Advisory locks exist only for report jobs (`reportJobService.ts`) and per-transaction serialization.

Two collectors would duplicate history:
- Event IDs are a `randomUUID()` per receipt (`measurementSpool.ts:77`).
- Deduplication on `(timestamp, event_id)` (`schema.ts:218`) only makes a single spool's replays idempotent.
- Alarm and webhook side effects would also double.

Database outages are already absorbed: the spool holds 1,000,000 entries, about 2.8 h at 100 tags × 1 Hz (`docs/CAPACITY.md`). Backup and restore into a fresh host is tested (D02/D03). Dependencies D04, H08 and E03 are open.

**External evidence.**
- [PostgreSQL advisory locks](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS): a session lock is "held until explicitly released or the session ends".
- [Kleppmann, fencing tokens](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html): a lock without a token checked at the write cannot stop a stale holder.

**Options considered.**
1. Status quo: restore-based cold standby.
2. PostgreSQL streaming replication with manual promotion.
3. Active/passive collector with a lease.
4. Active/active.

**Decision: DEFER. Keep the item open.** The Done text itself requires deferral while simpler operation meets the targets.

Trigger: the pilot owner agrees RPO/RTO (ROADMAP "Recovery objectives") and the D06 restore drill measurably misses them. Example: measured fresh-host restore time exceeds the RTO, or host-loss exposure (the spool lives on the same host) exceeds the RPO.

**Smallest build when triggered.**
- A collector lease: a session advisory lock on a dedicated connection taken before any OPC UA session. Stop the subscriptions when that connection is lost.
- A lease epoch stamped on spooled samples and checked in the `processBatch` transaction (fencing).
- Test: two app processes against one isolated database and owned simulator produce no duplicate samples, and `kill -9` of the holder triggers takeover.
- Limit: this does not detect a second installation using a *different* database. That remains procedural.
- Optional, separate from HA: the startup lock alone is a cheap guard against accidentally running two replicas.

---

## I08 — Evaluate connector packaging for contributors

**Question.** Which minimal extension interface should contributors use, given two real adapters?

**Current evidence.**
- The OPC UA collector (`server/src/opc-ua/opcuaClient.ts`, `measurementIdentity.ts`) is the only ingestion path into the spool.
- The Modbus adapter does not plug into the collector. It is a co-located OPC UA server (`server/src/gateway/legacyGateway.ts`) with its own PKI. It is started in-process by `configuredGateway.ts` or standalone by `runGateway.ts`.
- Identity uses namespace URIs (`measurementIdentity.ts`). Quality uses StatusCodes; source time is gateway observation time (`docs/LEGACY_GATEWAY.md`).
- C10 (fixture harness) and I02 (integration API) are open.

**External evidence.**
- [OPC 10000-2 security model](https://reference.opcfoundation.org/specs/OPC-10000-2/full) (S06): application trust and user identity are already handled at this boundary.
- [ThingsBoard gateway connectors](https://thingsboard.io/docs/iot-gateway/connectors/) (S04): a normalized gateway contract is preferable to many native drivers.

**Options considered.**
1. In-process adapter interface with dynamic loading.
2. Workspace packages implementing a TypeScript `Connector` interface.
3. An "adapter = read-only OPC UA server" contract.
4. Push into the HTTP API (I02).

**Decision: REJECT packaging (options 1, 2 and 4). Close as rejected.** The extension boundary is option 3.

- **Interface.** A read-only OPC UA server with:
  - a stable namespace URI;
  - Good/Bad StatusCodes, with no invented values;
  - a SourceTimestamp, or explicit observation time;
  - SignAndEncrypt and explicit trust.
- **Fixture contract.** C10's list: disconnect, duplicate, bad quality, type change and timestamp.
- **Compatibility policy.** The existing COMPATIBILITY.md rules: simulator results are separate, and entries name vendor, model, firmware, mapping and commit.

Reopen trigger: a third adapter whose semantics a read-only OPC UA server cannot carry faithfully. For example, native MQTT/Sparkplug with session state (C06), or push events that must not be resampled.

Uncertainty: if the maintainer reads "real adapters" as hardware-qualified, keep the item open, blocked on C10.

**Closure work.** A docs-only commit:
- a short "Adding a connector" section in CONTRIBUTING.md or LEGACY_GATEWAY.md;
- the stale `docs/COMPATIBILITY.md` identity lines were corrected in backlog wave 1.

---

## E06 — Decide whether separate-company tenancy is justified

**Question.** Should multiple companies share one hosted installation?

**Current evidence.**
- One company per installation: `docs/SECURITY_BOUNDARIES.md:42-43`, `docs/DAILY_OPERATIONS.md:21-22`, `docs/STATUS.md:130`, and ROADMAP "Deployment scale".
- Site/asset grants are not tenant isolation.
- `machineScope()` returns no filter when no scope exists; background jobs rely on this (accepted risk, SECURITY_BOUNDARIES).
- The app role `dashboard` owns its database (`docs/OPERATIONS.md`).
- Dependencies E02, E03 and E05 are open. There are zero customers.

**External evidence.**

[PostgreSQL row security](https://www.postgresql.org/docs/16/ddl-rowsecurity.html): "Table owners normally bypass row security as well". Database-enforced isolation would therefore need role changes and `FORCE ROW LEVEL SECURITY` on every table, not just a filter.

**Options considered.**
1. Separate installations (status quo: separate database, PKI, keys and spool).
2. Hosted shared database with a tenant column and RLS.
3. Database or schema per tenant behind one application.
4. Hosted per-company stacks.

**Decision: REJECT hosted tenancy (options 2 and 3). Close as rejected.** The Done text prescribes continuing separate deployments unless the gate is passed. "Real demand" cannot be measured with zero customers.

Option 4 is just automated separate installations and needs no tenancy design.

Reopen trigger, all of:
- at least one named organization requires hosted multi-company service;
- separate-install cost is measured (hours per install and upgrade, from P06) and exceeds hosting cost;
- E01/E02/E05 are complete;
- an independent isolation test is budgeted.

**Smallest build if ever reopened.** Option 4 first: `scripts/operate.mjs` per-company projects plus fleet upgrade (E04). Do not add tenant columns.

---

## X02 — Evaluate anomaly and predictive-maintenance models

**Question.** Is a model-based detector better than the simple threshold baseline?

**Current evidence.**
- No labeled incidents or physical history exist (RESEARCH "Unknowns").
- Threshold rules with hysteresis and debounce: `alarmService.ts`.
- SPC evaluators are experimental: `spcEvaluator.ts`. Q01 is open.
- Maintenance incidents exist only from simulator tests (`docs/DAILY_OPERATIONS.md`).
- Dependencies Q01 and M03 are open; H07 is done.

**External evidence.** [Google, Rules of ML](https://developers.google.com/machine-learning/guides/rules-of-ml), rule 1: "Don't be afraid to launch a product without machine learning."

**Options considered.**
1. Unsupervised anomaly scores on simulator data. Meaningless: the simulator encodes its own faults.
2. Wait for labels.
3. Reject.

**Decision: REJECT. Close as rejected.** The Done text prescribes rejection when labels or operational value are insufficient; both are absent. ROADMAP "Advanced prediction" keeps descriptive analytics first.

Reopen trigger, all of:
- Maintenance records hold labeled incidents with asset, failure mode and time. As a planning heuristic, not a statistical guarantee: at least 20 of one failure mode across at least 2 assets.
- The data covers a later held-out period.
- The threshold baseline (A01/M03) runs in production for comparison.
- There is a named maintenance owner who will act on alerts.

**Smallest build if reopened.** An offline evaluation script only, with no UI. It reports, against the threshold baseline on held-out assets and periods, the false-positive rate, missed events and lead time.

---

## X04 — Prototype bounded capacity and completion forecasts

**Question.** Can completion times for runs and work orders be forecast with honest ranges?

**Current evidence.**
- Product runs and calendars: `docs/DAILY_OPERATIONS.md`, `productionCalendar.ts`.
- Work orders: `workOrderExchange.ts`.
- Frozen shift reports and fair comparisons: `docs/FACTORY_READINESS.md`, R06 done.
- O05 is done.
- All history is synthetic.

**External evidence.** [Hyndman & Athanasopoulos, FPP3 §5.2](https://otexts.com/fpp3/simple-methods.html): "Some forecasting methods are extremely simple and surprisingly effective." Benchmarks and [time-series cross-validation](https://otexts.com/fpp3/tscv.html) are the minimum for a backtest.

**Options considered.**
1. A model fitted to simulator runs. Circular, so not used.
2. A naive estimate: remaining quantity divided by the recent verified rate, with an empirical interval.
3. Defer.

**Decision: DEFER. Keep the item open.**
- Blocker: no real completed runs. The Done text requires a backtest against actual completions.
- Trigger: the pilot records at least about 20 completed runs of comparable product and machine, with verified shift reports, actual end times and declared process changes.

**Smallest build when triggered.**
- A read-only service computing option 2 from verified reports: an interval from the empirical rate distribution, withheld below N comparable runs or with incomplete coverage.
- A backtest script over held-out runs.
- One advisory panel. It never reschedules.
- Tests: insufficient history withholds the estimate; a process change resets comparability.

---

## X06 — Test improvement recommendations with evidence

**Question.** Do rule-based recommendations help more than the existing ranked loss list?

**Current evidence.**
- Ranked downtime keeps unknown time separate (`docs/DAILY_OPERATIONS.md:122`).
- Fair frozen comparisons (`docs/FACTORY_READINESS.md`, R06).
- Maintenance actions with measured recovery and recurrence (FACTORY_READINESS) already link actions to outcomes.
- Incident replay is done (X03).
- M06 is open: action linking to normalized before/after periods.

**External evidence.** None needed beyond the Done text. The comparison is empirical and needs users (see P06).

**Options considered.**
1. Build rule recommendations now.
2. Keep the ranked list and measure whether users act on it.
3. Reject.

**Decision: DEFER. Keep the item open.**
- Blocker: the usefulness comparison needs pilot users (P06) and M06.
- Trigger: a P06 review shows supervisors see the top-ranked losses but do not choose actions, or ask "what should we do". There must also be at least one accepted action with a measurable before/after period.

**Smallest build when triggered.**
- At most three explicit rules over existing evidence. Examples: an unclassified-stop share above a threshold means classify first; a recurring alarm after a completed action means escalate.
- Each recommendation cites its report revision and assumptions, can be dismissed with a reason, and links to the existing maintenance-action outcome.
- An A/B usefulness log compared with the ranked list.

---

## C06 — Add MQTT ingestion and evaluate Sparkplug

**Question.** Should MQTT or Sparkplug ingestion be built now? If yes, what is the smallest secure scope?

**Current evidence.**
- No MQTT dependency (`server/package.json`).
- COMPATIBILITY.md excludes MQTT.
- C05 (connector contract) is open.
- The pilot is OPC UA.
- The spool assigns random event IDs (`measurementSpool.ts:77`), so broker redelivery would not deduplicate today.

**External evidence.**
- [MQTT 5.0](https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html), QoS 1: "messages are assured to arrive but duplicates can occur". QoS 2 holds only between client and broker; it is not end-to-end.
- [Sparkplug 3.0](https://sparkplug.eclipse.org/specification/version/3.0/documents/sparkplug-specification-3.0.0.pdf): host applications must publish STATE. After a reorder timeout, a host "MUST send an NCMD to the Edge Node with a Node Control/Rebirth request". Aliases and birth state are needed to decode data received mid-session.

**Options considered.**
1. Plain-MQTT native subscriber.
2. MQTT-to-OPC UA adapter (I08 pattern).
3. Sparkplug host application.
4. Defer.

**Decision: DEFER. Keep the item open.**
- Blockers: C05, and no MQTT source in any inventory.
- A Sparkplug host also conflicts with "read-only toward machines": rebirth is a command to the edge. Selecting Sparkplug needs an explicit product decision allowing only `Node Control/Rebirth`, or a passive non-primary host that marks gaps unknown.
- Trigger: P01 names an MQTT-only source for a nominated machine, with a broker owner and test equipment.

**Smallest secure scope when triggered (option 1, no Sparkplug).**
- TLS 1.2+ to the broker with CA pinning, plus a per-installation subscribe-only identity.
- Broker ACL restricts that identity to the mapped topics. Negative test: publishing is refused, and unmapped topics are ignored.
- A validated mapping per topic: JSON pointer, type, unit, a required source timestamp, and size limits.
- A deterministic `eventId = hash(signalId, sourceTimestamp, value)`. This requires an optional caller-supplied ID in `MeasurementSpool.enqueue`.
- Out-of-order samples go through the existing H07 policy.
- Fixtures against an owned Mosquitto: duplicate redelivery, reordering, malformed payload, broker restart and TLS failure.

---

## H08 — Complete authenticated edge-to-central history

**Question.** Should edge-to-central history be built before a multi-site customer exists?

**Current evidence.**
- `server/src/services/edgeSyncService.ts` returns 501 (F04 honest boundary). `docs/P0_ACCEPTANCE.md:21` and `docs/STATUS.md:122` agree.
- Idempotency foundation: stable per-sample event IDs with a unique `(timestamp, event_id)` (`schema.ts:218`).
- Identity is site-local: `machine_id` is a local integer, and `signalId` hashes `endpointUrl`, which can collide across sites with equal private IPs (`measurementIdentity.ts`).
- E01 (site permissions) is done in backlog wave 1; I01 (outbox) is open.

**External evidence.** [Ignition store-and-forward](https://docs.inductiveautomation.com/docs/8.3/platform/store-and-forward) (S01): removal only after database confirmation. This matches the AGENTS.md rule.

**Options considered.**
1. Build the full receiver now.
2. Database-level logical replication.
3. Defer and keep 501.

**Decision: DEFER. Keep the item open.**
- Blockers: no named multi-site customer; I01 open.
- Trigger (RESEARCH "Is central multi-site hosting actually required?"): a sponsor names at least two sites, link reliability, residency, and who needs central views.

**Smallest build when triggered.**
- An edge identity: per-edge client certificate (mTLS) or a hashed token, revocable.
- The edge pushes committed rows from an outbox cursor, not the spool.
- The central side stores `(edge_id, event_id)` as a unique key and site-qualified machine identity, accepts only allow-listed schema versions, inserts transactionally, and returns committed IDs.
- The edge advances its cursor only on acknowledgment.
- Tests: lost response, partial or invalid batch, crash between commit and cursor update, revoked edge, schema mismatch, and colliding machine IDs across two edges.

---

## E02 — Federated identity (OIDC) and service-account scopes

**Question.** Should OIDC sign-in and least-privilege machine accounts be built now?

**Current evidence.**
- Local accounts with five roles (`server/src/middleware/auth.ts`).
- Sessions are invalidated on user change or deactivation (`server/src/services/sessionAccess.ts`).
- Deny-by-default asset allowlist (`assetAccess.ts`).
- The only non-session credential is a static `ADMIN_API_KEY` header on `/api/v1/status/debug` (`statusRoutes.ts:121`). It matched when both sides were unset; backlog wave 1 now requires a configured key and compares in constant time.
- The share-token pattern (256-bit, SHA-256 stored, expiry) is reusable (`docs/SECURITY_BOUNDARIES.md`).
- E01 is done (backlog wave 1).

**External evidence.**
- [OIDC Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html).
- [OIDC Back-Channel Logout](https://openid.net/specs/openid-connect-backchannel-1_0.html) §2.7: the client "clears any state associated with the identified session(s)". This requires the IdP to reach the dashboard, which is often blocked in OT zones.
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700) (OAuth security best current practice: authorization code with PKCE).

**Options considered.**
1. OIDC now with a generic provider.
2. Service-account tokens only.
3. Defer both.

**Decision: DEFER. Keep the item open.**
- Blockers: the Done text needs "a selected OIDC provider", and no customer IdP exists. E01 is done.
- Triggers, either of:
  - customer IT names an IdP and requires SSO/MFA for the pilot;
  - an integration (I02) needs non-human API access. This can start service accounts alone.

**Smallest build when triggered.**
- Authorization code with PKCE through a maintained, OpenID-certified relying-party library (check the current certification listing).
- Map IdP groups onto existing roles and asset grants. Never auto-grant admin.
- Session revocation via the existing `userVersion` check plus logout and back-channel where reachable.
- Service accounts: hashed, expiring, read-only tokens scoped to machines, reusing the share-token code.
- A documented, audited local recovery admin that is disabled by default.
- Negative tests: wrong issuer or audience, expired token, a revoked group, and a token outside its scope.

---

## P01 — Validate the first customer and machine use case

**Status: OPEN.** Blocker: no operator, engineer or production lead available. Everything below is a hypothesis.

**Observation guide** (one shift, plus about 45 min interviews each; record verbatim and timestamped; no personal performance judgments, per the ROADMAP).
- **Operator.** Walk me through the last stop: how was it noticed, explained and recorded? Where do you see the job, counts and alarms now? What do you write down at handover? What would you not want on a screen?
- **Automation engineer.**
  - The line inventory: per machine, controller and firmware, protocol and OPC UA licence, gateways, permitted poll load and who can change it.
  - Whether alarms are configured (ProDiag or Program_Alarm), and the firmware version (A07).
  - The certificate and user process.
  - Restore expectations: acceptable data loss and downtime (D08).
- **Production lead.** How is the shift report made today, how long does it take, and who reads it? Name the top three loss questions from last month, and which decision changed because of data. What does "good enough accuracy" mean?
- **Observe.** Time spent producing the report. Stops without a reason. Paper or Excel artifacts (collect sanitized samples).

**Hypotheses** (each needs a refuting observation).
- H1: Unexplained stop time is the main pain. Refuted if leads already have reasons for more than 90% of stop minutes.
- H2: Report preparation takes at least 30 min per shift. Refuted if it is automated already.
- H3: The nominated machines expose OPC UA, so no new protocol is needed. Refuted by the inventory (C07/C06).
- H4: PLC alarm texts would speed stop classification. Refuted if alarms are absent or not trusted (A07).
- H5: Single-site, on-premises operation is acceptable. Refuted by a central-view or SSO demand (H08/E02).
- H6: Users accept "unknown" shown instead of zeros. Refuted if they override or distrust it.

**Output.** A nominated line, actual protocols, the current reporting effort, and the first improvement question, in a dated record.

---

## P06 — Review product usefulness after each pilot milestone

**Status: OPEN.** Blockers: P01, and the D06 supervised pilot.

**Baseline**, recorded before installation over at least 5 shifts, using the same definitions after:
1. **Commissioning effort.** Engineer minutes from endpoint to verified shift report, per machine; count the manual steps. Target reference: ROADMAP, 30 min on the simulator.
2. **Report preparation.** Minutes per shift, stopwatch or self-log, and who prepares it.
3. **Unresolved stop reasons.** Share of stop minutes without a reason at the end of the shift, and median time to classify. The app provides the "after" figure from report issues.
4. **Data coverage.** Share of the shift with unknown state or counter coverage. App-reported only after installation; there is no "before".
5. **Count reconciliation.** Delta from independent counts (the verified-report mechanism).
6. **Usefulness.** Per role, record (a) decisions made using the dashboard, (b) screens never opened, and (c) top complaint. Qualitative, verbatim.
7. **Operational load.** Restarts, stale-data incidents, and admin minutes per week.

KPI definitions should follow [ISO 22400-2](https://www.iso.org/standard/87563.html), Part 2: KPIs for manufacturing operations management. The second edition replaces the 2014 edition; check its current status. Where definitions differ, record the difference rather than silently converting.

**Review protocol.**
- At each milestone (M1 pilot, then every M2/M3 slice), compare measures 1–7 against the baseline using the same shifts and product mix where possible. R06's comparability rules apply.
- Write a dated review that reorders or removes backlog items. Examples: H1 refuted, so demote O-workflows; H4 confirmed, so trigger A07.
- Record qualitative evidence when numbers are unreliable. Never claim an OEE percentage improvement (ROADMAP "Improvement").

---

## Cross-cutting findings for the maintainer

- `docs/COMPATIBILITY.md` claimed anonymous-only identity; corrected in backlog wave 1.
- `docs/S7_1500_PILOT.md` ("does not … call methods") must name ConditionRefresh as the sole permitted method if A07 proceeds. It must also tell the PLC owner that the CPU option "Allow message acknowledgment by OPC UA client" applies to *every* client.
- Closing I08, E06 and X02 requires the TODO convention: append the evidence (a docs commit referencing this decision record) and keep the reopen trigger beside the checkbox.
