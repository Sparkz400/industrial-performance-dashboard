vi.mock("../../services/accessScope.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/accessScope.js")>()),
  loadAccessScope: async (userId: number, role: string) => ({
    userId,
    role,
    machineIds: [],
    dashboardIds: [],
  }),
}));
import { expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import session from "express-session";
import { io as connect } from "socket.io-client";
vi.mock("../../opc-ua/services/opcuaConnectionManager.js", () => ({
  default: {},
}));
vi.mock("../../services/sessionAccess.js", async () => ({
  sessionEvents: new (await import("node:events")).EventEmitter(),
  getSessionUser: async (session: { userId?: number; userRole?: string }) =>
    session?.userId
      ? { id: session.userId, role: session.userRole ?? "viewer" }
      : null,
}));
import { createSocketServer } from "../../socket/socketServer.js";
import config from "../../config/config.js";
import alarmEvaluator from "../../services/alarmService.js";

it("denies alarm acknowledgment from a signed wallboard socket", async () => {
  const acknowledge = vi
    .spyOn(alarmEvaluator, "acknowledge")
    .mockResolvedValue(null);
  const store = new session.MemoryStore();
  const server = createServer();
  const { io } = createSocketServer(
    server,
    store as unknown as Parameters<typeof createSocketServer>[1],
  );
  io.on("connection", (socket) =>
    socket.onAny((event, reply) => {
      if (event === "owned:barrier") reply();
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const id = "owned-wallboard";
  const cookie = new session.Cookie();
  cookie.maxAge = 60000;
  await new Promise<void>((resolve, reject) =>
    store.set(
      id,
      { cookie, userId: 7, username: "display", userRole: "wallboard" },
      (error) => (error ? reject(error) : resolve()),
    ),
  );
  const signature = createHmac("sha256", config.SESSION_SECRET)
    .update(id)
    .digest("base64")
    .replace(/=+$/, "");
  const client = connect(`http://127.0.0.1:${address.port}`, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: {
      cookie: `connect.sid=${encodeURIComponent(`s:${id}.${signature}`)}`,
    },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    client.emit("acknowledgeAlert", { id: 1 });
    await new Promise<void>((resolve) => client.emit("owned:barrier", resolve));
    expect(acknowledge).not.toHaveBeenCalled();
  } finally {
    client.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    acknowledge.mockRestore();
  }
});

it("rejects unsigned handshakes without accumulating store listeners and accepts a signed session", async () => {
  const store = new session.MemoryStore();
  const server = createServer();
  const { io } = createSocketServer(
    server,
    store as unknown as Parameters<typeof createSocketServer>[1],
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test listener");
  const url = `http://127.0.0.1:${address.port}`;
  const counts = [
    store.listenerCount("connect"),
    store.listenerCount("disconnect"),
  ];
  try {
    for (let i = 0; i < 20; i++) {
      const client = connect(url, {
        transports: ["websocket"],
        reconnection: false,
        timeout: 2000,
      });
      try {
        const error = await new Promise<Error>((resolve) =>
          client.once("connect_error", resolve),
        );
        expect(error.message).toBe("Authentication required");
      } finally {
        client.disconnect();
      }
    }
    expect([
      store.listenerCount("connect"),
      store.listenerCount("disconnect"),
    ]).toEqual(counts);
    const id = "owned-socket-session";
    const cookie = new session.Cookie();
    cookie.maxAge = 60_000;
    await new Promise<void>((resolve, reject) =>
      store.set(
        id,
        {
          cookie,
          userId: 7,
          username: "fixture",
          userRole: "viewer",
        },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    const signature = createHmac("sha256", config.SESSION_SECRET)
      .update(id)
      .digest("base64")
      .replace(/=+$/, "");
    const client = connect(url, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 2000,
      extraHeaders: {
        cookie: `connect.sid=${encodeURIComponent(`s:${id}.${signature}`)}`,
      },
    });
    try {
      await new Promise<void>((resolve, reject) => {
        client.once("connect", resolve);
        client.once("connect_error", reject);
      });
      expect(client.connected).toBe(true);
      const disconnected = new Promise<void>((resolve) =>
        client.once("disconnect", () => resolve()),
      );
      const { sessionEvents } = await import("../../services/sessionAccess.js");
      sessionEvents.emit("sessionRevoked", id);
      await disconnected;
      expect(client.connected).toBe(false);
    } finally {
      client.disconnect();
    }
  } finally {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});

it("disconnects an expired socket even if it sends no further requests", async () => {
  const store = new session.MemoryStore();
  const server = createServer();
  const { io } = createSocketServer(
    server,
    store as unknown as Parameters<typeof createSocketServer>[1],
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing listener");
  const id = "expiring-fixture";
  const cookie = new session.Cookie();
  cookie.maxAge = 1000;
  await new Promise<void>((resolve, reject) =>
    store.set(
      id,
      { cookie, userId: 7, userRole: "viewer", username: "fixture" },
      (error) => (error ? reject(error) : resolve()),
    ),
  );
  const signature = createHmac("sha256", config.SESSION_SECRET)
    .update(id)
    .digest("base64")
    .replace(/=+$/, "");
  const client = connect(`http://127.0.0.1:${address.port}`, {
    transports: ["websocket"],
    reconnection: false,
    extraHeaders: {
      cookie: `connect.sid=${encodeURIComponent(`s:${id}.${signature}`)}`,
    },
  });
  try {
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    const disconnected = new Promise<void>((resolve) =>
      client.once("disconnect", () => resolve()),
    );
    await disconnected;
    expect(client.connected).toBe(false);
  } finally {
    client.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});
