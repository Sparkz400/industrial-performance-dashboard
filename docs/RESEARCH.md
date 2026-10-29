# Capability assessment and product research

Research date: **2026-10-26**. Code baseline: `6b5556493e7c48687a43cc9d90df3aba0be1374e`.

This is the preserved pre-fix assessment. The [P0 acceptance record](P0_ACCEPTANCE.md)
tracks subsequent trend/SPC/identity fixes and the disabled-edge boundary.
The AI assistant has since been removed; use [STATUS](STATUS.md) and [TODO](../TODO.md) for current behavior.

This assessment separates code that exists, documented test coverage, gaps found
by inspection, and proposed product opportunities. It does not certify a machine,
deployment, security posture or regulated workflow. External product descriptions
are vendor claims, not independent benchmarks. No customer interviews or physical
machine trials were conducted for this research.

Read the [roadmap](ROADMAP.md) for direction and the [TODO backlog](../TODO.md)
for executable work. [STATUS.md](STATUS.md) remains the current support boundary.

## What the project can do today

**The foundation is a self-hosted OPC UA monitoring application with a broad set
of experimental operations screens.** It can demonstrate connecting a machine,
mapping scalar signals, retaining measurements and presenting live/history views.
The breadth of screens is ahead of their end-to-end qualification.

Legend: **Core** means implemented, with focused tests documented in STATUS;
**Present** means an implementation was found, without complete acceptance evidence;
**Experimental** means incomplete, materially limited or explicitly unqualified.
None of these labels means production-ready.

| Area | What exists | Evidence and practical limit |
| --- | --- | --- |
| OPC UA acquisition — Core | Per-machine connections, browsing, tag mappings, subscriptions and reconnect handling | [Collector](../server/src/opc-ua/opcuaClient.ts), [compatibility](COMPATIBILITY.md). Session creation is anonymous; configured channel security is distinct from user authentication. Scalar values only; physical models/firmware remain unqualified. |
| Measurement history — Core | Numeric, Boolean and text raw values, quality and timestamps; numeric projection for charts | [Queue worker](../server/src/queue/opcuaQueueWorker.ts), [spool](../server/src/queue/measurementSpool.ts). Local durable buffering and replay exist; unreceived events cannot be reconstructed. |
| OEE — Core, bounded | Mapped operating states, ideal cycle and production/quality counters; coverage-aware calculation | [Calculation](../server/src/services/oeeCalculationService.ts), [tests](../server/src/__tests__/unit/oeeCalculationService.test.ts). Decreases mean reset-to-zero; shift, rollover and manual-count semantics need work. |
| Dashboards — Present | Configurable layouts/widgets, templates, time ranges, annotations and exports | [Dashboard feature](../client/src/features/dashboard), [widgets](../client/src/features/widgets). A configured display does not validate the meaning of its signals. |
| Trend exploration — Present | Multiple numeric series, time filters, aggregation and CSV export | [Trending service](../server/src/services/trendingDataService.ts). Queries cap each series at 2,000 points; raw queries order oldest first. Exports accumulate results in memory. |
| Alarms and alerts — Experimental end-to-end | Alarm evaluator, a second alert-rule engine, histories and configuration screens | [Bridge](../server/src/opcuaBridge.ts), [alarm service](../server/src/services/alarmService.ts), [alert evaluator](../server/src/services/alertEvaluationService.ts). The bridge calls the alarm evaluator; inspection found no measurement caller of the second evaluator. |
| Scheduled reports — Present | Templates, schedules, PDF generation and email delivery services | [Report generator](../server/src/services/reportGeneratorService.ts), [scheduler](../server/src/services/reportSchedulerService.ts), [email](../server/src/services/reportEmailService.ts). Recovery, duplicate sends and shift-boundary reconciliation require acceptance tests. |
| Users and sharing — Present | Sessions, admin/viewer roles, dashboard share tokens and embeds | [Schema](../server/src/database/schema.ts), [sharing](../server/src/services/shareService.ts). Site/asset permissions and cross-company isolation are not established. |
| Plants — Experimental scope | Plant metadata, timezone and membership tables/screens | [Plant service](../server/src/services/plantService.ts). A plant record is not proof that every query, socket and export enforces its boundary. Separate companies currently need separate installations. |
| SPC — Experimental | Profiles, baselines, Z-score, moving-average, CUSUM and Western Electric evaluators | [SPC service](../server/src/services/spcService.ts), [evaluators](../server/src/services/spcEvaluator.ts). Baseline query and in-memory buffer identity are not consistently machine/profile scoped. Statistical suitability has not been established. |
| Recipes and batches — Experimental | Versioned recipe records, planned/running/completed/aborted batches, batch summaries/comparison | [Recipes](../server/src/services/recipeService.ts), [batches](../server/src/services/batchService.ts). Starting a batch updates application records; the inspected flow does not apply a recipe to a PLC. |
| Digital twins — Experimental | Sanitized SVG templates, instances and signal bindings | [Twin service](../server/src/services/digitalTwinService.ts), [client feature](../client/src/features/digital-twin). These are live visual representations, not validated physics or process simulations. |
| Compliance records — Experimental | Audit records, signature verification, integrity verification and exports | [Compliance service](../server/src/services/complianceService.ts). These components do not establish regulatory compliance, tamper resistance against a database administrator or a validated electronic-record system. |
| Edge/cloud — Experimental | Database-backed sync queue, retries, status/configuration and receiving endpoint | [Edge service](../server/src/services/edgeSyncService.ts). Receiver inserts into `edge_sync_queue`; it does not materialize canonical historian records. This queue is separate from the acquisition SQLite spool. |
| Webhooks — Experimental | Registration, test delivery, HMAC signing and outbound-request protection | [Webhook service](../server/src/services/webhookService.ts). `triggerEvent` has no production call site in the inspected source; delivery is fire-and-forget, without a durable delivery outbox. |
| Custom widgets — Supported (sandboxed runtime) | Validated manifests, a sandboxed iframe runtime with an opaque origin, a minimal read-only message protocol, pinned versions and CSP frame sources | [Protocol](CUSTOM_WIDGETS.md), [runtime](../client/src/features/widgets/types/custom-widget/CustomWidgetFrame.tsx), [service](../server/src/services/customWidgetService.ts). A hostile widget is tested; a widget with `readSeries` can still pass its data on, so register trusted widgets only. |
| Backup and restore — Present, narrow | Dashboard configuration export/import | [Backup UI](../client/src/features/settings/tabs/BackupRestoreTab.tsx). This is not a complete PostgreSQL, spool, certificate and configuration recovery procedure. |
| Installable UI — Present, narrow | Browser install-prompt and standalone-display detection hook | [PWA hook](../client/src/hooks/usePWA.ts). This does not establish safe offline work queues or fresh machine data while disconnected. |
| Public project infrastructure — Present | Apache-2.0, contribution/security/support guidance, CI, dependency and container checks, wiki publishing source | [Workflows](../.github/workflows), [contributing](../CONTRIBUTING.md). Keep this foundation; future work is release evidence, useful examples and maintenance, rather than recreating generic repository files. |

## Code findings that change the priority order

These are reproducible inspection findings, not newly executed failure tests. Each
needs a focused regression test when implemented.

| Finding | Why it matters | Backlog |
| --- | --- | --- |
| Raw trend queries use ascending order and `limit(2000)`; automatic buckets are selected by range length rather than actual sample density | A busy signal can show only the beginning of the requested window. Numeric-only responses also lack explicit coverage/truncation metadata. | H02, H03 |
| SPC buffers use `nodeKey`; the baseline query filters on `node_key` and time but not machine/profile | Two machines with a common key can contaminate a baseline/window. Multiple profiles can also share mutable sample state. | F02, Q01 |
| Two alarm/alert implementations exist; only one is called from the acquisition bridge | A configured rule in one UI may never receive measurements through its intended engine. | F03, A01 |
| Webhook trigger method has no production caller; deliveries are not durably scheduled | A successful test button is insufficient evidence that an actual production event reaches an integration. | F03, I01 |
| Edge receive acknowledges by inserting queue rows, without canonical historian writes | A healthy-looking sync status can be mistaken for a working central history database. | F04, H08 |
| Backup UI exports dashboard configuration | A user could still lack the material needed to recover measurements and credentials after host loss. | D02 |
| The local production build reports large chunks, including an approximately 3.87 MB minified dashboard-page chunk | Startup and interaction on operator devices need measurement; bundle size alone is not a measured user-perceived delay. | U10, D04 |

## What comparable tools and standards suggest

The opportunities below are this project's proposals. They are not promises of
feature parity, throughput, protocol certification or compatibility with the
products used as references.

| Reference | Observed capability or principle | Opportunity here |
| --- | --- | --- |
| Ignition 8.3 [S01] | Describes memory/disk buffering, database-confirmed removal, forwarding control and quarantine management | Make backlog age, disk capacity, failed records and recovery visible; preserve the spool guarantees already implemented. |
| Sepasoft OEE [S02] | Describes shift/run context, equipment states/modes, downtime reasons, schedules, corrections and line-level loss analysis | Turn OEE from a gauge into a reconciled shift workflow. Treat multi-machine bottleneck analysis as a later, separately validated feature. |
| MachineMetrics [S03] | Describes operator tablets, downtime classification, job context, shop-floor displays and quality reporting | Prioritize operator input and actionable loss summaries alongside automatic collection. Do not copy its broad connectivity claims into our compatibility list. |
| ThingsBoard Gateway [S04] | Documents connectors for heterogeneous equipment, including OPC UA, Modbus, MQTT and S7 | Use a normalized ingestion contract and proven gateways before maintaining many native drivers. Its ecosystem is a reference, not a drop-in integration. |
| OPC UA Machinery [S05] | Defines reusable identification, state, operating-mode, counters and monitoring building blocks | Suggest mappings from information models, preserve namespace identity and require user review of inferred semantics. |
| OPC UA security [S06, S07] | Distinguishes user identity, application trust and least privilege | Add protected endpoint identities, explicit trust decisions and credential lifecycle. Keep monitoring identities read-only. |
| Eclipse Sparkplug [S08, S09] | Defines MQTT topic/payload/session conventions, including birth/death state | A later Sparkplug connector should preserve availability and session identity; a received payload alone is not proof that equipment is online. |
| ISA-95 [S10] | Provides manufacturing/business integration models and common equipment terminology | Adopt stable asset, product and work-order identities for integrations; full MES replacement is unnecessary. Only the public overview was reviewed. |
| NIST OT security [S11] | Addresses security alongside OT reliability, performance and safety constraints | Ship a documented network boundary, least-privilege deployment, recovery procedure and operator-controlled upgrades. Rev. 3 is final; Rev. 4 was a draft at research time. |
| W3C WCAG 2.2 [S12] | Covers focus visibility, non-drag alternatives, target sizes and accessible authentication | Test commissioning, dashboards and operator workflows with keyboard, screen reader, touch and non-color status cues. |
| NIST statistical handbook [S13, S14] | Separates process stability, specification limits and capability | Validate SPC per process/product and explain sample requirements; do not label arbitrary rolling thresholds as proven process capability. |
| MTConnect model [S15] | Formalizes manufacturing data semantics | Investigate a CNC adapter when a pilot needs it; record the actual Agent/model version and replay behavior before choosing an implementation. |
| DOE energy management [S16] | Uses measurement and continual improvement to manage energy performance | Build trustworthy consumption and intensity trends before cost/carbon estimates. An energy dashboard alone is not an energy-management certification. |

## Product opportunity and positioning

The strongest first audience is a small or medium factory with mixed-generation
equipment, an automation engineer and a production lead, seeking an on-premises
view of one line. This is a **target-customer hypothesis**, not validated demand.

The proposed value is: **connect existing equipment, explain lost production,
and show exactly how much of the answer is supported by trustworthy data.**
Useful differentiation would come from:

1. Evidence beside every KPI: source mappings, coverage, exclusions and corrections.
2. A guided route from an OPC UA endpoint to a usable machine template and shift report.
3. A practical path for older machines through gateways or explicitly labeled manual input.
4. Local operation, exportable data and clear boundaries for optional cloud services.
The earlier TIA MCP handoff proposal was withdrawn on 2026-10-26. Performance
Dashboard is an independent product with no planned TIA MCP integration.

The product should grow from monitoring into selected operations workflows where
the same collected data creates value: downtime, quality, maintenance and energy.
Enterprise hosting and predictive models should follow demand and proven data
quality, not lead the implementation.

## Unknowns to resolve before committing to larger investments

| Unknown | Cheapest useful investigation | Decision it unlocks |
| --- | --- | --- |
| Who uses this daily and what decision improves? | Observe an operator, production lead and commissioning engineer using one shift's data; record their five most frequent tasks. | First pilot and default screens, P01/U01. |
| Which old machines matter? | Inventory actual endpoints, gateways, firmware, rates and signal permissions for a nominated line. | C05/C06/C07 priority; no universal driver commitment. |
| Is the product discrete manufacturing only initially? | Reconcile counts, ideal cycles, scrap and downtime with the pilot's process owner. | OEE assumptions; continuous/batch-specific profiles deferred until defined. |
| What scale is affordable? | Measure ingestion, storage and interactive query behavior on declared hardware with replayable fixtures. | Retention/index/partition decisions H05/H06 and D04. |
| Which integrations save manual work? | Obtain one sanitized order export and one destination event contract. | I02/I03 versus speculative vendor connectors. |
| Is central multi-site hosting actually required? | Establish sites, link reliability, data residency and permission boundaries with a pilot sponsor. | H08/E03; separate-company tenancy remains gated by E06. |
| Are predictive features useful? | Obtain historical labeled incidents and compare against a basic threshold model. | X02; no failure-probability claims without evaluation. |

## Source register

All sources below were consulted on **2026-10-26**. Product pages establish what
their vendors describe, not what this repository implements. Standards overview
pages are not substitutes for a normative conformance assessment. No proprietary
standard text or vendor code was copied into this project.

- **S01** — [Ignition 8.3: Store and Forward](https://docs.inductiveautomation.com/docs/8.3/platform/store-and-forward).
- **S02** — [Sepasoft: OEE Downtime](https://www.sepasoft.com/products/oee-downtime-tracking/).
- **S03** — [MachineMetrics: CNC Machine Monitoring](https://www.machinemetrics.com/machine-monitoring).
- **S04** — [ThingsBoard IoT Gateway: Connectors Overview](https://thingsboard.io/docs/iot-gateway/connectors/).
- **S05** — [OPC 40001-1: Machinery Basic Building Blocks](https://reference.opcfoundation.org/specs/OPC-40001-1/full).
- **S06** — [OPC UA Part 2: Security Model](https://reference.opcfoundation.org/specs/OPC-10000-2/full).
- **S07** — [OPC UA Part 2: Least Privilege](https://reference.opcfoundation.org/specs/OPC-10000-2/6.17).
- **S08** — [Eclipse Sparkplug: Specification and Revision History](https://sparkplug.eclipse.org/specification/).
- **S09** — [Eclipse Sparkplug 3.0 Specification](https://sparkplug.eclipse.org/specification/version/3.0/documents/sparkplug-specification-3.0.0.pdf).
- **S10** — [ISA: ISA-95 Enterprise-Control System Integration](https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard).
- **S11** — [NIST SP 800-82 Rev. 3: Guide to OT Security](https://csrc.nist.gov/pubs/sp/800/82/r3/final).
- **S12** — [W3C: What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/).
- **S13** — [NIST: Assessing Process Stability](https://itl.nist.gov/div898/handbook/ppc/section4/ppc45.htm).
- **S14** — [NIST: What Is Process Capability?](https://www.itl.nist.gov/div898/handbook/pmc/section1/pmc16.htm).
- **S15** — [MTConnect V2.2 Model: Semantic Data Model](https://model.mtconnect.org/Version2.2/Glossary/semanticdatamodel/). This terminology reference is not a claim that V2.2 is the latest supported implementation.
- **S16** — [U.S. DOE: Energy Management Programs](https://www.energy.gov/cmei/ito/energy-management-programs).

## Maintaining this assessment

Recheck the affected source and implementation when selecting an item for work.
Replace inspection findings with a regression test and resulting evidence when
fixed. Update this assessment, STATUS, the roadmap and wiki overview together
when a feature moves from experimental to supported. Record the qualifying commit
and deployment; passing one simulator run must not silently expand machine support.

## Verification of this planning change

Only documentation changed. Both production builds and the client TypeScript check
passed locally. The client suite passed **64 tests**. The first combined client/server
run timed out in four server first-route tests at the configured 15-second limit;
the subsequent standalone server run passed **113 tests** in 15 files. The cause
of those initial timeouts was not established, so they remain recorded under F10
alongside existing nested-mock deprecation warnings.

The backlog was checked for unique IDs, acceptance criteria, valid prerequisites,
cycles and milestone ordering. Local documentation links and wiki page references
were checked as well. No new physical-machine trials, browser acceptance run,
customer interviews or security qualification were performed for this documentation
change. Earlier repository evidence must still be read against its exact commit.
