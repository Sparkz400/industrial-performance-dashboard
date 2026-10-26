# Architecture

The React client connects to the Node.js server through authenticated REST/tRPC
and live socket updates. The collector buffers samples on local disk before
writing PostgreSQL history. Shared TypeScript contracts connect the workspaces.

The interface, charts and wallboards use locally bundled Figtree fonts with
tabular numerals; technical identifiers retain monospace. Regular and italic
fonts and their stylesheet are precached for offline use without an external font
service. See
[font source and license](https://github.com/Sparkz400/performance_dashboard/blob/main/client/public/fonts/figtree/README.md).

New measurements preserve namespace-aware identity and receive time. Dense trend
queries span the selected interval with quality gaps and explicit resolution.
Edge transfer remains disabled. The AI assistant and provider integration have been removed.

See the [architecture guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/ARCHITECTURE.md)
for measurement quality, durable replay, OEE boundaries and deployment limits.

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

[Incident replay](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/INCIDENT_REPLAY.md)
reads a consistent, bounded snapshot of one machine's signals, alarm transitions,
operator revisions and stop classifications. Source and receive clocks remain
separate; missing quality/time and truncated history are explicit.

Scheduled PDFs use PDFKit and embedded fonts on Node 24/Wolfi, without a production
browser. Existing database/volume paths remain intact. See the
[reporting contracts and evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/REPORTING.md).
