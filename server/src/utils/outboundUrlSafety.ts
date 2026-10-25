import { lookup } from "node:dns/promises";
import net from "node:net";
import { Agent, fetch as request, type RequestInit } from "undici";

import config from "../config/config.js";
import { ValidationError } from "./errors.js";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function isPrivateIpv4(address: string): boolean {
  const [first, second] = address.split(".").map(Number);
  if (first === 0 || first >= 224) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  if (first === 198 && (second === 18 || second === 19)) return true;
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
    !/^[23]/.test(normalized) ||
    normalized.startsWith("2001:db8:") ||
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
  if (parsed.username || parsed.password) {
    throw new ValidationError(`${label} must not contain credentials`);
  }

  if (config.ALLOW_PRIVATE_OUTBOUND_URLS) {
    return parsed;
  }

  const addresses = await resolveHostAddresses(
    parsed.hostname.replace(/^\[|\]$/g, ""),
  );
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

/** Validate DNS at connection time too, and never follow redirects to an unchecked host. */
export async function fetchSafeOutbound(
  rawUrl: string,
  options: RequestInit = {},
) {
  const url = await assertSafeOutboundUrl(rawUrl);
  const dispatcher = new Agent({
    maxResponseSize: 1024 * 1024,
    connect: {
      lookup: (hostname, options, callback) => {
        lookup(hostname, { all: true, verbatim: true })
          .then((addresses) => {
            if (
              !addresses.length ||
              (!config.ALLOW_PRIVATE_OUTBOUND_URLS &&
                addresses.some((entry) => isPrivateAddress(entry.address)))
            ) {
              callback(new ValidationError("Blocked outbound address"), [], 0);
            } else if (options.all) {
              callback(null, addresses);
            } else {
              callback(null, addresses[0].address, addresses[0].family);
            }
          })
          .catch((error) => callback(error, [], 0));
      },
    },
  });
  try {
    const response = await request(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      dispatcher,
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      json: () => JSON.parse(body) as unknown,
    };
  } finally {
    await dispatcher.close();
  }
}
