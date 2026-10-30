# Architecture

[Data integrity and reviewed operations](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DATA_INTEGRITY.md)
adds evidence-backed widgets, reviewed corrections, bounded calculated signals,
explicit offline drafts, durable CMMS handoffs and versioned energy estimates.
Frozen reports and physical qualification remain separate.

[Factory operations](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/FACTORY_OPERATIONS.md)
adds transactional setup-import receipts and work-order identities, scoped diagnostic
and asset reads, and signed offline packages tied to a tested source/image revision.

[Factory readiness](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/FACTORY_READINESS.md)
adds scoped supervisor line/action workflows, attributable maintenance corrections,
fair comparisons of frozen shift reports and full-application endurance testing.
Short runs do not establish multi-day reliability; physical qualification remains open.

The React client connects to the Node.js server through authenticated REST/tRPC
and live socket updates. The collector buffers samples on local disk before
writing PostgreSQL history. Shared TypeScript contracts connect the workspaces.

A [guarded OPC UA dependency patch](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DEPENDENCY_REVIEW.md#opc-ua-overflow-patch)
preserves non-Good quality during server notification queue overflow; changed
dependency code requires review before installation can continue.

The interface, charts and wallboards use locally bundled Figtree fonts with
tabular numerals; technical identifiers retain monospace. Regular and italic
fonts and their stylesheet are precached for offline use without an external font
service. See
[font source and license](https://github.com/Sparkz400/performance_dashboard/blob/main/client/public/fonts/figtree/README.md).

Light and dark modes use grey/charcoal industrial surfaces and orange accents,
with raised controls, recessed charts and distinct status colors. The
[shared UI theme](https://github.com/Sparkz400/performance_dashboard/blob/main/client/src/theme/modernTheme.ts)
and [chart theme](https://github.com/Sparkz400/performance_dashboard/blob/main/client/src/theme/chartTheme.ts)
keep controls, axes and tooltips consistent while preserving measurement behavior.

New measurements preserve namespace-aware identity and receive time. Dense trend
queries span the selected interval with quality gaps and explicit resolution.
Edge sites send committed history to a central installation that stores it once per source
event and acknowledges only what it committed ([edge sites](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/MULTI_SITE.md)). Sign-in is local or
OIDC, and integrations may use read-only service tokens ([identity](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/IDENTITY.md)).
The AI assistant and provider integration have been removed.

See the [architecture guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/ARCHITECTURE.md)
for measurement quality, durable replay, OEE boundaries and deployment limits.
One collector per database holds a PostgreSQL advisory lock; records PostgreSQL refuses
are quarantined on the collector instead of blocking the spool. Outbound webhooks are a
durable outbox described in the
[integration API contract](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/INTEGRATION_API.md).

See [[Roadmap]] for proposed contracts, connector expansion and multi-site work.
Those proposals do not describe functionality already supported by this architecture.

The [production workflow](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/PRODUCTION_WORKFLOW.md)
covers guided commissioning, immutable shift profiles, operator corrections,
reconciled reports, durable alarm delivery and the single-company permission policy.
Public sharing and legacy notification channels are disabled. Physical qualification
remains open. Protected OPC UA identities are tested against owned servers.

The optional [legacy gateway](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/LEGACY_GATEWAY.md)
polls a bounded read-only Modbus register block and exposes encrypted local OPC UA.
Its configuration and identity are included in managed backups; recovery stops polling.
Serial RTU devices are reached through an RTU-to-TCP gateway by unit identifier.

[MQTT sources](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/PRODUCTION_WORKFLOW.md#mqtt-sources)
subscribe read-only over TLS and acknowledge a message only after it is in the durable
spool. [PLC alarm observation](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DAILY_OPERATIONS.md#plc-alarms)
stores OPC UA alarm events and calls only ConditionRefresh; it never acknowledges.

[Incident replay](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/INCIDENT_REPLAY.md)
reads a consistent, bounded snapshot of one machine's signals, alarm transitions,
operator revisions and stop classifications. Source and receive clocks remain
separate; missing quality/time and truncated history are explicit.

Scheduled PDFs use PDFKit and embedded fonts on Node 24/Wolfi, without a production
browser. Existing database/volume paths remain intact. See the
[reporting contracts and evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/REPORTING.md).

[Daily factory workflows](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DAILY_OPERATIONS.md)
cover scoped roles, history retention, calendars/product runs, immutable reports,
maintenance and energy. [Acceptance evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/DAILY_OPERATIONS_ACCEPTANCE.md)
separates software checks from physical S7-1500 and operator acceptance.

[Quality and line operations](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/QUALITY_LINE_OPERATIONS.md)
adds frozen batch recipes, inspection/rework/lot evidence, reviewed SPC reference
periods, production-line analysis and alarm-linked maintenance actions. It also
covers measured disk runway, exact reviewed retention schedules, offline image
bundles and configurable synthetic endurance workloads using the compiled frontend
and confirmed browser session renewal. Scoped supervisor access
now extends line investigations and alarm actions. These workflows do not establish
multi-day reliability or supported hardware capacity.
