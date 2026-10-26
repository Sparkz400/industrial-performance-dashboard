import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** Owned register fixture only; these addresses are not a vendor machine map. */
export async function createModbusSimulator(port = 1502) {
  const state = {
    available: true,
    requests: [] as { unitId: number; functionCode: number }[],
  };
  const sockets = new Set<import("node:net").Socket>();
  const began = Date.now();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      if (!Buffer.isBuffer(chunk)) return socket.destroy();
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 260) return socket.destroy();
      if (buffer.length < 12) return;
      if (
        buffer.length !== 12 ||
        buffer.readUInt16BE(2) !== 0 ||
        buffer.readUInt16BE(4) !== 6
      )
        return socket.destroy();
      const unitId = buffer[6],
        functionCode = buffer[7],
        start = buffer.readUInt16BE(8),
        count = buffer.readUInt16BE(10);
      state.requests.push({ unitId, functionCode });
      if (state.requests.length > 256) state.requests.shift();
      if (!state.available) return socket.destroy();
      const error = ![3, 4].includes(functionCode)
        ? 1
        : ![1, 2].includes(unitId) || start + count > 7 || count < 1
          ? 2
          : 0;
      const values = Buffer.alloc(14);
      const total = unitId * 100 + Math.floor((Date.now() - began) / 1000);
      values.writeUInt16BE(1, 0);
      values.writeUInt32BE(total, 2);
      values.writeUInt32BE(total - Math.floor(total / 10), 6);
      values.writeUInt32BE(Math.floor(total / 10), 10);
      const response = Buffer.alloc(error ? 9 : 9 + count * 2);
      buffer.copy(response, 0, 0, 4);
      response.writeUInt16BE(response.length - 6, 4);
      response[6] = unitId;
      response[7] = error ? functionCode | 0x80 : functionCode;
      response[8] = error || count * 2;
      if (!error) values.copy(response, 9, start * 2, (start + count) * 2);
      socket.end(response);
    });
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing simulator port");
  return {
    state,
    port: address.port,
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.argv[2] ?? 1502);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Simulator port must be 1024–65535");
  const simulator = await createModbusSimulator(port);
  console.log(
    `Owned Modbus register fixture on 127.0.0.1:${simulator.port}; unit IDs 1 and 2, read functions 3/4, offsets 0–6.`,
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void simulator.stop();
    });
}
