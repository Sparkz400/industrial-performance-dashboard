import { createConnection } from "node:net";
import { randomInt } from "node:crypto";
import Joi from "joi";

export interface GatewayTag {
  key: string;
  offset: number;
  type: "uint16" | "int16" | "uint32" | "int32" | "float32";
  wordOrder: "high-first" | "low-first";
}
export interface GatewayConfig {
  name: string;
  namespaceUri: string;
  opcuaPort: number;
  pkiDirectory: string;
  trustedClientCertificate: string;
  modbus: {
    host: string;
    port: number;
    unitId: number;
    functionCode: 3 | 4;
    startAddress: number;
    count: number;
    timeoutMs: number;
    pollMs: number;
  };
  tags: GatewayTag[];
}
export function validateGatewayConfig(value: unknown): GatewayConfig {
  const port = Joi.number().integer().min(1).max(65535).required();
  const { value: config, error } = Joi.object({
    name: Joi.string()
      .pattern(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
      .required(),
    namespaceUri: Joi.string()
      .pattern(/^urn:[A-Za-z0-9:_.-]+$/)
      .max(200)
      .required(),
    opcuaPort: port,
    pkiDirectory: Joi.string().max(1024).required(),
    trustedClientCertificate: Joi.string().max(1024).required(),
    modbus: Joi.object({
      host: Joi.string()
        .pattern(/^[A-Za-z0-9][A-Za-z0-9.-]*$/)
        .max(253)
        .required(),
      port,
      unitId: Joi.number().integer().min(0).max(255).required(),
      functionCode: Joi.number().valid(3, 4).required(),
      startAddress: Joi.number().integer().min(0).max(65535).required(),
      count: Joi.number().integer().min(1).max(125).required(),
      timeoutMs: Joi.number().integer().min(100).max(10000).default(1000),
      pollMs: Joi.number().integer().min(100).max(60000).default(1000),
    }).required(),
    tags: Joi.array()
      .min(1)
      .max(64)
      .unique("key")
      .items(
        Joi.object({
          key: Joi.string()
            .pattern(/^[A-Za-z][A-Za-z0-9_]{0,99}$/)
            .required(),
          offset: Joi.number().integer().min(0).max(124).required(),
          type: Joi.string()
            .valid("uint16", "int16", "uint32", "int32", "float32")
            .required(),
          wordOrder: Joi.string()
            .valid("high-first", "low-first")
            .default("high-first"),
        }),
      )
      .required(),
  }).validate(value, { abortEarly: false, convert: false });
  if (error) throw new Error(`Invalid gateway configuration: ${error.message}`);
  const result = config as GatewayConfig;
  if (result.modbus.startAddress + result.modbus.count > 65536)
    throw new Error("Register range exceeds the Modbus address space");
  for (const tag of result.tags)
    if (tag.offset + (tag.type.endsWith("16") ? 1 : 2) > result.modbus.count)
      throw new Error(`Tag ${tag.key} exceeds the configured register block`);
  return result;
}

export function decodeRegister(data: Buffer, tag: GatewayTag): number {
  const at = tag.offset * 2;
  if (tag.type === "uint16") return data.readUInt16BE(at);
  if (tag.type === "int16") return data.readInt16BE(at);
  const words = Buffer.from(data.subarray(at, at + 4));
  if (words.length !== 4) throw new Error("Incomplete register value");
  if (tag.wordOrder === "low-first") {
    const first = words.readUInt16BE(0);
    words.writeUInt16BE(words.readUInt16BE(2), 0);
    words.writeUInt16BE(first, 2);
  }
  const value =
    tag.type === "uint32"
      ? words.readUInt32BE(0)
      : tag.type === "int32"
        ? words.readInt32BE(0)
        : words.readFloatBE(0);
  if (!Number.isFinite(value)) throw new Error("Non-finite register value");
  return value;
}

/** One bounded read transaction per connection. No write function exists in this adapter. */
export function readRegisters(
  config: GatewayConfig["modbus"],
): Promise<Buffer> {
  if (
    ![3, 4].includes(config.functionCode) ||
    !Number.isInteger(config.count) ||
    config.count < 1 ||
    config.count > 125 ||
    !Number.isInteger(config.startAddress) ||
    config.startAddress < 0 ||
    config.startAddress + config.count > 65536
  )
    throw new Error("Only bounded register reads are supported");
  const transaction = randomInt(65536);
  const request = Buffer.alloc(12);
  request.writeUInt16BE(transaction, 0);
  request.writeUInt16BE(6, 4);
  request[6] = config.unitId;
  request[7] = config.functionCode;
  request.writeUInt16BE(config.startAddress, 8);
  request.writeUInt16BE(config.count, 10);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: config.host, port: config.port });
    let data = Buffer.alloc(0),
      settled = false;
    const finish = (error?: Error, value?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(
      () => finish(new Error("Modbus read timed out")),
      config.timeoutMs,
    );
    socket.once("connect", () => socket.write(request));
    socket.on("error", (error) => finish(error));
    socket.once("close", () =>
      finish(new Error("Modbus connection closed before a complete response")),
    );
    socket.on("data", (chunk) => {
      if (!Buffer.isBuffer(chunk))
        return finish(new Error("Expected a binary Modbus response"));
      data = Buffer.concat([data, chunk]);
      if (data.length > 260)
        return finish(new Error("Oversized Modbus response"));
      if (data.length < 7) return;
      const length = data.readUInt16BE(4);
      if (
        length < 2 ||
        length > 254 ||
        data.readUInt16BE(0) !== transaction ||
        data.readUInt16BE(2) !== 0 ||
        data[6] !== config.unitId
      )
        return finish(new Error("Mismatched Modbus response header"));
      if (data.length < length + 6) return;
      if (data.length !== length + 6)
        return finish(new Error("Unexpected trailing Modbus data"));
      if (data[7] === (config.functionCode | 0x80) && length === 3)
        return finish(new Error(`Modbus exception ${data[8]}`));
      if (
        data[7] !== config.functionCode ||
        length !== 3 + config.count * 2 ||
        data[8] !== config.count * 2
      )
        return finish(new Error("Invalid Modbus register response"));
      finish(undefined, data.subarray(9));
    });
  });
}
