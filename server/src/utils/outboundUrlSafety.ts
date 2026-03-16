import { lookup } from "node:dns/promises";
import net from "node:net";

import config from "../config/config.js";
import { ValidationError } from "./errors.js";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function isPrivateIpv4(address: string): boolean {
  if (address.startsWith("10.")) return true;
  if (address.startsWith("127.")) return true;
  if (address.startsWith("169.254.")) return true;
  if (address.startsWith("192.168.")) return true;

  const match = address.match(/^172\.(\d{1,3})\./);
  if (!match) return false;

  const secondOctet = Number.parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return false;
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return [hostname];
  }

  if (net.isIP(hostname) !== 0) {
    return [hostname];
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true });
  return resolved.map((entry) => entry.address);
}

export async function assertSafeOutboundUrl(
  rawUrl: string,
  label = "URL",
): Promise<URL> {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ValidationError(`Invalid ${label}`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new ValidationError(`${label} must use http:// or https://`);
  }

  if (!parsed.hostname) {
    throw new ValidationError(`${label} must include a hostname`);
  }

  if (config.ALLOW_PRIVATE_OUTBOUND_URLS) {
    return parsed;
  }

  const addresses = await resolveHostAddresses(parsed.hostname);
  if (addresses.length === 0) {
    throw new ValidationError(`${label} hostname could not be resolved`);
  }

  const hasPrivateAddress = addresses.some(
    (address) =>
      address === "localhost" ||
      address.endsWith(".localhost") ||
      isPrivateAddress(address),
  );

  if (hasPrivateAddress) {
    throw new ValidationError(
      `${label} must not target localhost or private network addresses`,
    );
  }

  return parsed;
}
