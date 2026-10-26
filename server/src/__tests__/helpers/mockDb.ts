import { vi } from "vitest";

/**
 * Creates a chainable mock that mimics Drizzle ORM's fluent query API.
 */
export function createMockDbChain(resolvedValue: any = []) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(resolvedValue),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    transaction: vi.fn(async (fn: any) => fn(chain)),
  };

  chain.then = vi.fn((resolve: any) =>
    Promise.resolve(resolvedValue).then(resolve),
  );

  return chain;
}

// Use the real session/CSRF lifecycle without pretending to implement PostgreSQL's wire types.
vi.mock("connect-pg-simple", async () => {
  const { default: session } = await import("express-session");
  return { default: () => session.MemoryStore };
});
vi.mock("../../database/dbConnection.js", () => ({
  default: {
    pool: {
      query: async () => ({ rows: [{ now: new Date() }], rowCount: 1 }),
      on: () => {},
      end: async () => {},
    },
    getConnectionOverview: () => ({}),
    getQueryMetrics: () => ({}),
    end: async () => {},
    getReadPool: () => {},
  },
}));

vi.mock("../../opc-ua/services/opcuaConnectionManager.js", () => ({
  default: {
    startConnection: async () => {},
    disconnectConnection: async () => {},
    getConnectionInfo: () => ({ status: "disconnected" }),
  },
}));

vi.mock("../../opc-ua/services/multiMachineManager.js", () => ({
  default: {
    initialize: async () => {},
    getConnectedMachineIds: () => [],
    refreshMachineConnection: async () => {},
    disconnectMachine: async () => {},
    disconnectAll: async () => {},
    browseNodes: async () => [],
    on: () => {},
    emit: () => {},
  },
}));

vi.mock("../../opc-ua/opcuaClient.js", () => ({
  opcuaEmitter: { on: () => {}, emit: () => {}, off: () => {} },
}));

vi.mock("../../observability/tracing.js", () => ({
  initTracing: () => {},
  shutdownTracing: async () => {},
}));

vi.mock("../../observability/metrics.js", () => ({
  metricsMiddleware: (_req: any, _res: any, next: any) => next(),
  metricsRegistry: {
    contentType: "text/plain",
    metrics: async () => "",
  },
  opcuaDataPointsReceived: { inc: () => {} },
}));

vi.mock("../../socket/socketServer.js", () => ({
  createSocketServer: () => ({
    io: { close: () => {} },
    opcuaService: { broadcastNodeChange: () => {} },
    machineService: { broadcastStatusChange: () => {} },
  }),
}));

vi.mock("../../queue/opcuaQueueWorker.js", () => ({
  default: { enqueue: () => {}, start: () => {}, stop: () => {} },
}));

vi.mock("../../utils/logger.js", () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    http: () => {},
    middleware: (_req: any, _res: any, next: any) => next(),
  },
}));

vi.mock("../../opc-ua/services/certificateLogsService.js", () => ({
  default: {
    getListedCertificates: async () => [],
    getRejectedCertificates: async () => [],
    trustCertificate: async () => {},
    acceptRejectedCertificate: async () => {},
    regenerateClientCertificate: async () => {},
    getClientCertificateInfo: async () => null,
    getSecurityOptions: () => [],
  },
}));
