import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { once } from "node:events";
import {
  decodeRegister,
  readRegisters,
  validateGatewayConfig,
} from "../../gateway/modbusRead.js";

const block = {
  host: "127.0.0.1",
  port: 1502,
  functionCode: 3 as const,
  unitId: 1,
  startAddress: 0,
  count: 2,
  timeoutMs: 100,
  pollMs: 1000,
};
const config = {
  name: "Owned",
  namespaceUri: "urn:owned:registers",
  opcuaPort: 4842,
  pkiDirectory: "owned",
  trustedClientCertificate: "owned.pem",
  modbus: block,
  tags: [{ key: "Count", offset: 0, type: "uint32", wordOrder: "high-first" }],
};
describe("bounded read-only Modbus", () => {
  it("rejects write functions, duplicate tags and register overflow", () => {
    expect(validateGatewayConfig(config).tags).toHaveLength(1);
    for (const modbus of [
      { ...block, functionCode: 6 },
      { ...block, count: 126 },
      { ...block, startAddress: 65535 },
      { ...block, timeoutMs: 0 },
    ])
      expect(() => validateGatewayConfig({ ...config, modbus })).toThrow();
    expect(() =>
      validateGatewayConfig({
        ...config,
        tags: [...config.tags, ...config.tags],
      }),
    ).toThrow();
    expect(() =>
      validateGatewayConfig({
        ...config,
        tags: [{ ...config.tags[0], offset: 1 }],
      }),
    ).toThrow();
    expect(() => readRegisters({ ...block, functionCode: 6 as 3 })).toThrow(
      "reads",
    );
  });
  it("decodes signed values and explicit word order without hiding non-finite floats", () => {
    const tag = {
      key: "Value",
      offset: 0,
      type: "uint32" as const,
      wordOrder: "high-first" as const,
    };
    expect(decodeRegister(Buffer.from("00010002", "hex"), tag)).toBe(65538);
    expect(
      decodeRegister(Buffer.from("00010002", "hex"), {
        ...tag,
        wordOrder: "low-first",
      }),
    ).toBe(131073);
    expect(
      decodeRegister(Buffer.from("ffff", "hex"), { ...tag, type: "int16" }),
    ).toBe(-1);
    expect(
      decodeRegister(Buffer.from("fffffffe", "hex"), { ...tag, type: "int32" }),
    ).toBe(-2);
    expect(
      decodeRegister(Buffer.from("41480000", "hex"), {
        ...tag,
        type: "float32",
      }),
    ).toBe(12.5);
    expect(() =>
      decodeRegister(Buffer.from("7fc00000", "hex"), {
        ...tag,
        type: "float32",
      }),
    ).toThrow("Non-finite");
  });
  it("reads fragmented frames and rejects mismatched, oversized, exceptional and truncated replies", async () => {
    let mode = "good";
    const server = createServer((socket) => {
      socket.on("error", () => {});
      socket.once("data", (request) => {
        if (!Buffer.isBuffer(request))
          throw new Error("Expected binary fixture request");
        expect(request[7]).toBe(3);
        const response = Buffer.from("00000000000701030400010002", "hex");
        response.writeUInt16BE(request.readUInt16BE(0), 0);
        if (mode === "timeout") return;
        if (mode === "transaction")
          response.writeUInt16BE((request.readUInt16BE(0) + 1) % 65536, 0);
        if (mode === "protocol") response.writeUInt16BE(1, 2);
        if (mode === "unit") response[6] = 2;
        if (mode === "function") response[7] = 4;
        if (mode === "count") response[8] = 2;
        if (mode === "oversized") return socket.end(Buffer.alloc(261));
        if (mode === "exception") {
          response.writeUInt16BE(3, 4);
          response[7] = 0x83;
          response[8] = 2;
          return socket.end(response.subarray(0, 9));
        }
        if (mode === "truncated") return socket.end(response.subarray(0, 10));
        socket.write(response.subarray(0, 5));
        setTimeout(() => socket.end(response.subarray(5)), 5);
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No owned listener");
    try {
      expect(
        (await readRegisters({ ...block, port: address.port })).toString("hex"),
      ).toBe("00010002");
      for (mode of [
        "transaction",
        "protocol",
        "unit",
        "function",
        "count",
        "oversized",
        "exception",
        "truncated",
        "timeout",
      ])
        await expect(
          readRegisters({ ...block, port: address.port }),
        ).rejects.toThrow();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("addresses serial devices behind an RTU-to-TCP gateway by unit identifier", async () => {
    // Units 1 and 2 answer with their own registers; the absent unit 3 gets gateway exception 0x0B.
    const units = new Map([
      [1, "0001"],
      [2, "0002"],
    ]);
    const server = createServer((socket) => {
      socket.on("error", () => {});
      socket.once("data", (request) => {
        if (!Buffer.isBuffer(request))
          throw new Error("Expected binary fixture request");
        const registers = units.get(request[6]);
        const response = Buffer.from(
          registers ? `000000000005000302${registers}` : "00000000000300830b",
          "hex",
        );
        request.copy(response, 0, 0, 2);
        response[6] = request[6];
        socket.end(response);
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No owned listener");
    const read = (unitId: number) =>
      readRegisters({ ...block, port: address.port, unitId, count: 1 });
    try {
      expect((await read(1)).toString("hex")).toBe("0001");
      expect((await read(2)).toString("hex")).toBe("0002");
      await expect(read(3)).rejects.toThrow("Modbus exception 11");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
