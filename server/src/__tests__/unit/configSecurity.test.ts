import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());
const production = () => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SESSION_SECRET", "session-fixture-".repeat(4));
  vi.stubEnv("COOKIE_SECRET", "cookie-fixture-".repeat(4));
  vi.stubEnv("CLIENT_URL", "https://dashboard.example.invalid");
};

it("rejects short production secrets", async () => {
  production();
  vi.stubEnv("SESSION_SECRET", "short");
  await expect(import("../../config/config.js")).rejects.toThrow(
    "SESSION_SECRET",
  );
});

it("refuses a remote HTTP production origin but permits a local preview", async () => {
  production();
  vi.stubEnv("CLIENT_URL", "http://dashboard.example.invalid");
  await expect(import("../../config/config.js")).rejects.toThrow(
    "must use HTTPS",
  );
  vi.resetModules();
  vi.stubEnv("CLIENT_URL", "http://localhost:3001");
  expect((await import("../../config/config.js")).default.CLIENT_URL).toBe(
    "http://localhost:3001",
  );
});

it("accepts explicit proxy addresses and rejects boolean proxy trust", async () => {
  production();
  vi.stubEnv("TRUSTED_PROXIES", "127.0.0.1,::1,192.0.2.0/24");
  expect(
    (await import("../../config/config.js")).default.TRUSTED_PROXIES,
  ).toContain("192.0.2.0/24");
  vi.resetModules();
  vi.stubEnv("TRUSTED_PROXIES", "true");
  await expect(import("../../config/config.js")).rejects.toThrow(
    "proxy IP addresses",
  );
});
