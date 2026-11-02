import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { createMockDbChain } from "../helpers/mockDb.js";

vi.mock("../../database/db.js", async () => {
  const { createMockDbChain } = await import("../helpers/mockDb.js");
  return { default: createMockDbChain() };
});
import db from "../../database/db.js";
const mockDb = db as unknown as ReturnType<typeof createMockDbChain>;
vi.mock("../../utils/outboundUrlSafety.js", () => ({
  assertSafeOutboundUrl: async (url: string) => new URL(url),
  fetchSafeOutbound: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
}));
import { webhookService } from "../../services/webhookService.js";
import { fetchSafeOutbound } from "../../utils/outboundUrlSafety.js";

let directory: string;
let rows: any[];
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await mkdtemp(join(tmpdir(), "pd-webhook-security-"));
  vi.stubEnv("MACHINE_SECRETS_KEY_FILE", join(directory, "key"));
  rows = [];
  mockDb.then.mockImplementation((resolve: any) =>
    Promise.resolve(rows).then(resolve),
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

it("persists ciphertext, reveals the new key once and signs deliveries with the original key", async () => {
  mockDb.returning.mockResolvedValue([
    {
      id: 7,
      secret: "pending",
      kind: "webhook",
      url: "https://receiver.invalid",
    },
  ]);
  const created = await webhookService.createWebhook({
    name: "Fixture",
    url: "https://receiver.invalid",
    events: ["alarm.triggered"],
  });
  const sealed = mockDb.set.mock.calls[0][0].secret;
  expect(sealed).toMatch(/^sealed:v1:/);
  expect(sealed).not.toContain(created.secret);
  expect(sealed.length).toBeLessThanOrEqual(255);
  expect(mockDb.values.mock.calls[0][0].secret).toBe("pending");
  rows = [{ ...created, secret: sealed }];
  expect((await webhookService.testWebhook(7)).success).toBe(true);
  const options = vi.mocked(fetchSafeOutbound).mock.calls[0][1]!;
  expect(
    (options.headers as Record<string, string>)["X-Webhook-Signature"],
  ).toBe(
    createHmac("sha256", created.secret)
      .update(String(options.body))
      .digest("hex"),
  );
  rows[0].id = 8;
  expect((await webhookService.testWebhook(8)).success).toBe(false);
  expect(fetchSafeOutbound).toHaveBeenCalledTimes(1);
});

it("upgrades existing signing keys without changing them and is idempotent", async () => {
  rows = [{ id: 9, secret: "whsec_owned_fixture" }];
  await webhookService.encryptLegacySecrets();
  rows[0].secret = mockDb.set.mock.calls[0][0].secret;
  expect((await webhookService.listWebhooks())[0].secret).toBe(
    "whsec_owned_fixture",
  );
  mockDb.set.mockClear();
  await webhookService.encryptLegacySecrets();
  expect(mockDb.set).not.toHaveBeenCalled();
});

it("refuses a missing key before upgrading any remaining plaintext destinations", async () => {
  rows = [{ id: 10, secret: "whsec_owned_fixture" }];
  await webhookService.encryptLegacySecrets();
  rows[0].secret = mockDb.set.mock.calls[0][0].secret;
  rows.unshift({ id: 11, secret: "other_owned_fixture" });
  await unlink(join(directory, "key"));
  mockDb.set.mockClear();
  await expect(webhookService.encryptLegacySecrets()).rejects.toThrow(
    "Restore",
  );
  expect(mockDb.set).not.toHaveBeenCalled();
  await expect(readFile(join(directory, "key"))).rejects.toThrow();
});
