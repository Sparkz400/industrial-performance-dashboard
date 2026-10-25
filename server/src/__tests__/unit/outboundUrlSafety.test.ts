import { afterEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
import { lookup } from "node:dns/promises";
import config from "../../config/config.js";
import {
  assertSafeOutboundUrl,
  fetchSafeOutbound,
} from "../../utils/outboundUrlSafety.js";

afterEach(() => {
  config.ALLOW_PRIVATE_OUTBOUND_URLS = false;
  vi.resetAllMocks();
});

it.each([
  "http://127.0.0.1",
  "http://0.0.0.0",
  "http://100.64.0.1",
  "http://169.254.169.254",
  "http://[::ffff:127.0.0.1]",
  "http://[::1]",
  "http://user:pass@example.com",
  "file:///tmp/secret",
])("rejects unsafe URL %s", async (url) => {
  config.ALLOW_PRIVATE_OUTBOUND_URLS = false;
  await expect(assertSafeOutboundUrl(url)).rejects.toThrow();
});

it("rejects DNS rebinding when the address changes before connecting", async () => {
  config.ALLOW_PRIVATE_OUTBOUND_URLS = false;
  vi.mocked(lookup)
    .mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }] as never)
    .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
  await expect(
    fetchSafeOutbound("http://public.example.test"),
  ).rejects.toThrow();
  expect(lookup).toHaveBeenCalledTimes(2);
});

it("refuses redirects and oversized responses even when local test endpoints are allowed", async () => {
  config.ALLOW_PRIVATE_OUTBOUND_URLS = true;
  let targetHits = 0;
  const server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/target" });
      res.end();
    } else if (req.url === "/large") {
      res.end("x".repeat(1024 * 1024 + 1));
    } else {
      targetHits++;
      res.end("{}");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  try {
    const origin = `http://127.0.0.1:${address.port}`;
    await expect(fetchSafeOutbound(`${origin}/redirect`)).rejects.toThrow();
    await expect(fetchSafeOutbound(`${origin}/large`)).rejects.toThrow();
    expect(targetHits).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
