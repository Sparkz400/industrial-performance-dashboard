# Architecture

The React client connects to the Node.js server through authenticated REST/tRPC
and live socket updates. The collector buffers samples on local disk before
writing PostgreSQL history. Shared TypeScript contracts connect the workspaces.

New measurements preserve namespace-aware identity and receive time. Dense trend
queries span the selected interval with quality gaps and explicit resolution.
Edge transfer remains disabled; AI suggestions do not execute database queries.

See the [architecture guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/ARCHITECTURE.md)
for measurement quality, durable replay, OEE boundaries and deployment limits.

See [[Roadmap]] for proposed contracts, connector expansion and multi-site work.
Those proposals do not describe functionality already supported by this architecture.

The [production workflow](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/PRODUCTION_WORKFLOW.md)
covers guided commissioning, immutable shift profiles, operator corrections,
reconciled reports, durable alarm delivery and the single-company permission policy.
Public sharing and legacy notification channels are disabled. Physical qualification
and protected OPC UA identities remain open.

Scheduled PDFs use PDFKit and embedded fonts on Node 24/Wolfi, without a production
browser. Existing database/volume paths remain intact. See the
[reporting contracts and evidence](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/REPORTING.md).
