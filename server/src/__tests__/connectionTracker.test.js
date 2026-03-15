import connectionTracker from "../utils/connectionTracker.js";

describe("ConnectionTracker", () => {
  beforeEach(() => {
    connectionTracker.reset();
  });

  describe("addConnection", () => {
    it("should increment active connection count", () => {
      const count = connectionTracker.addConnection("socket-1");
      expect(count).toBe(1);
      expect(connectionTracker.getActiveConnectionCount()).toBe(1);
    });

    it("should track multiple connections", () => {
      connectionTracker.addConnection("socket-1");
      connectionTracker.addConnection("socket-2");
      connectionTracker.addConnection("socket-3");
      expect(connectionTracker.getActiveConnectionCount()).toBe(3);
    });

    it("should store connection info in connectedClients", () => {
      connectionTracker.addConnection("socket-1", { ip: "127.0.0.1" });
      const clients = connectionTracker.getConnectedClients();
      expect(clients).toHaveLength(1);
      expect(clients[0].id).toBe("socket-1");
      expect(clients[0].ip).toBe("127.0.0.1");
      expect(clients[0].connectedAt).toBeInstanceOf(Date);
    });

    it("should add a connect entry to history", () => {
      connectionTracker.addConnection("socket-1");
      const history = connectionTracker.getConnectionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe("connect");
      expect(history[0].id).toBe("socket-1");
    });
  });

  describe("removeConnection", () => {
    it("should decrement active connection count", () => {
      connectionTracker.addConnection("socket-1");
      connectionTracker.addConnection("socket-2");
      const count = connectionTracker.removeConnection("socket-1");
      expect(count).toBe(1);
    });

    it("should not go below zero", () => {
      connectionTracker.addConnection("socket-1");
      connectionTracker.removeConnection("socket-1");
      const count = connectionTracker.removeConnection("socket-1"); // already removed
      expect(count).toBe(0);
    });

    it("should remove client from connectedClients", () => {
      connectionTracker.addConnection("socket-1");
      connectionTracker.removeConnection("socket-1");
      expect(connectionTracker.getConnectedClients()).toHaveLength(0);
    });

    it("should add a disconnect entry to history with duration", () => {
      connectionTracker.addConnection("socket-1");
      connectionTracker.removeConnection("socket-1");
      const history = connectionTracker.getConnectionHistory();
      expect(history).toHaveLength(2);

      const disconnectEntry = history.find((h) => h.type === "disconnect");
      expect(disconnectEntry).toBeDefined();
      expect(disconnectEntry.id).toBe("socket-1");
      expect(disconnectEntry.duration).toBeGreaterThanOrEqual(0);
    });

    it("should do nothing for an unknown socketId", () => {
      const count = connectionTracker.removeConnection("nonexistent");
      expect(count).toBe(0);
    });
  });

  describe("getConnectionHistory", () => {
    it("should return history limited by the provided limit", () => {
      for (let i = 0; i < 10; i++) {
        connectionTracker.addConnection(`s-${i}`);
      }
      const history = connectionTracker.getConnectionHistory(3);
      expect(history).toHaveLength(3);
    });

    it("should trim history when it exceeds maxHistoryLength", () => {
      // maxHistoryLength is 100 by default; add 105 connections
      for (let i = 0; i < 105; i++) {
        connectionTracker.addConnection(`s-${i}`);
      }
      const history = connectionTracker.getConnectionHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe("reset", () => {
    it("should clear all state", () => {
      connectionTracker.addConnection("socket-1");
      connectionTracker.addConnection("socket-2");
      connectionTracker.reset();

      expect(connectionTracker.getActiveConnectionCount()).toBe(0);
      expect(connectionTracker.getConnectedClients()).toHaveLength(0);
      expect(connectionTracker.getConnectionHistory()).toHaveLength(0);
    });
  });
});
