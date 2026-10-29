import { expect, it, vi } from "vitest";
vi.mock("ioredis", () => ({ default: vi.fn() }));
import { debugKeyAccepted } from "../../routes/statusRoutes.js";

it("never accepts a request when no debug key is configured", () => {
  expect(debugKeyAccepted(undefined, undefined)).toBe(false);
  expect(debugKeyAccepted("", undefined)).toBe(false);
  expect(debugKeyAccepted("anything", "")).toBe(false);
});

it("accepts only the exact configured key", () => {
  expect(debugKeyAccepted("s3cret-key", "s3cret-key")).toBe(true);
  expect(debugKeyAccepted("s3cret-kez", "s3cret-key")).toBe(false);
  expect(debugKeyAccepted("short", "s3cret-key")).toBe(false);
  expect(debugKeyAccepted(["s3cret-key"], "s3cret-key")).toBe(false);
});
