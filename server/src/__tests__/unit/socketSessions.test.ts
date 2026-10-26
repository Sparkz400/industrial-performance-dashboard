import { expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHmac } from "node:crypto";
import session from "express-session";
import { io as connect } from "socket.io-client";
vi.mock("../../opc-ua/services/opcuaConnectionManager.js", () => ({
  default: {},
}));
import { createSocketServer } from "../../socket/socketServer.js";
import config from "../../config/config.js";

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
    } finally {
      client.disconnect();
    }
  } finally {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});
