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
