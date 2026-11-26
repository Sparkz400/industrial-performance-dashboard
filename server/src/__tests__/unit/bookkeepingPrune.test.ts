import { expect, it, vi } from "vitest";
const execute = vi.hoisted(() => vi.fn());
vi.mock("../../database/db.js", () => ({
  default: { execute },
  getReadDb: () => ({ execute }),
}));
import alarmEvaluator from "../../services/alarmService.js";
import { webhookService } from "../../services/webhookService.js";

it.each([
  ["alarm receipts", () => alarmEvaluator.pruneReceipts()],
  ["delivered webhooks", () => webhookService.pruneDelivered()],
])("prunes %s in bounded batches until a short batch", async (_name, prune) => {
  execute.mockReset();
  execute
    .mockResolvedValueOnce({ rowCount: 10_000 })
    .mockResolvedValueOnce({ rowCount: 10_000 })
    .mockResolvedValueOnce({ rowCount: 5 });
  expect(await prune()).toBe(20_005);
  expect(execute).toHaveBeenCalledTimes(3);
});
