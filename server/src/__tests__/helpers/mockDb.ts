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

/**
 * Sets up all module-level mocks for the database and external services.
 * The pool mock includes in-memory session support for connect-pg-simple.
 */
// Mock dbConnection with an in-memory session-aware pool
vi.mock("../../database/dbConnection.js", () => {
  const sessions = new Map<string, { sess: string; expire: Date }>();

  const resolveQuery = async (text: string, values?: any[]) => {
    if (
      text.includes("CREATE TABLE") ||
      text.includes("CREATE UNLOGGED TABLE")
    ) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("SELECT") && text.includes('"session"')) {
      const sid = values?.[0];
      const stored = sessions.get(sid);
      if (stored && stored.expire > new Date()) {
        return { rows: [{ sess: stored.sess }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("INSERT") && text.includes('"session"')) {
      const sid = values?.[0];
      const sess = values?.[1];
      const expire = values?.[2];
      if (sid) {
        sessions.set(sid, {
          sess: typeof sess === "string" ? sess : JSON.stringify(sess),
          expire: new Date(expire || Date.now() + 86400000),
        });
      }
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("UPDATE") && text.includes('"session"')) {
      const sess = values?.[0];
      const expire = values?.[1];
      const sid = values?.[2];
      if (sid && sessions.has(sid)) {
        sessions.set(sid, {
          sess: typeof sess === "string" ? sess : JSON.stringify(sess),
          expire: new Date(expire || Date.now() + 86400000),
        });
      }
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("DELETE") && text.includes('"session"')) {
      const sid = values?.[0];
      if (sid) sessions.delete(sid);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [{ now: new Date() }], rowCount: 1 };
  };

  const query = (
    text: string,
    valuesOrCallback?: any[] | ((error: Error | null, result?: any) => void),
    maybeCallback?: (error: Error | null, result?: any) => void,
  ) => {
    const values = Array.isArray(valuesOrCallback)
      ? valuesOrCallback
      : undefined;
    const callback =
      typeof valuesOrCallback === "function" ? valuesOrCallback : maybeCallback;

    const promise = resolveQuery(text, values);
    if (callback) {
      void promise.then(
        (result) => callback(null, result),
        (error) =>
          callback(error instanceof Error ? error : new Error(String(error))),
      );
      return;
    }

    return promise;
  };

  return {
    default: {
      pool: {
        query,
        on: () => {},
        connect: async () => ({
          query,
          release: () => {},
        }),
        end: async () => {},
      },
      getConnectionOverview: () => ({}),
      getQueryMetrics: () => ({}),
      end: async () => {},
      getReadPool: () => {},
    },
  };
});

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

// Mock csrf-sync to bypass CSRF validation in tests
vi.mock("csrf-sync", () => ({
  csrfSync: () => ({
    generateToken: () => "test-csrf-token",
    csrfSynchronisedProtection: (_req: any, _res: any, next: any) => next(),
    invalidCsrfTokenError: new Error("Invalid CSRF"),
  }),
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
