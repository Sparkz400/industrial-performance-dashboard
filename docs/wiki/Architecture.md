# Architecture

The React client connects to the Node.js server through authenticated REST/tRPC
and live socket updates. The collector buffers samples on local disk before
writing PostgreSQL history. Shared TypeScript contracts connect the workspaces.

See the [architecture guide](https://github.com/Sparkz400/performance_dashboard/blob/main/docs/ARCHITECTURE.md)
for measurement quality, durable replay, OEE boundaries and deployment limits.
