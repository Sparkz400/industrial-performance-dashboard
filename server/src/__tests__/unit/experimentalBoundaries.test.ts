import { expect, it, vi } from "vitest";
vi.mock("../../database/db.js", () => ({
  default: {
    insert: vi.fn(() => {
      throw new Error("must not write");
    }),
  },
}));
import { edgeSyncService } from "../../services/edgeSyncService.js";
it("does not acknowledge edge data as central history or start transfers", async () => {
  expect(edgeSyncService.isEdgeMode()).toBe(false);
  await expect(
    edgeSyncService.ingestFromEdge("edge", [{ payload: 1 }]),
  ).rejects.toMatchObject({ statusCode: 501 });
  await expect(edgeSyncService.processSync()).rejects.toMatchObject({
    statusCode: 501,
  });
});
