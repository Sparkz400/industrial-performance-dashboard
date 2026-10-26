import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../database/db.js", () => ({
  default: {
    insert: vi.fn(() => {
      throw new Error("must not write");
    }),
  },
}));
import { edgeSyncService } from "../../services/edgeSyncService.js";
import { nlQueryService } from "../../services/nlQueryService.js";
import config from "../../config/config.js";
const originalKey = config.ANTHROPIC_API_KEY;
afterEach(() => {
  vi.unstubAllGlobals();
  config.ANTHROPIC_API_KEY = originalKey;
});
it("does not acknowledge edge data as central history or start transfers", async () => {
  expect(edgeSyncService.isEdgeMode()).toBe(false);
  await expect(
    edgeSyncService.ingestFromEdge("edge", [{ payload: 1 }]),
  ).rejects.toMatchObject({ statusCode: 501 });
  await expect(edgeSyncService.processSync()).rejects.toMatchObject({
    statusCode: 501,
  });
});
it("labels AI suggestions and discards invented chart data without executing SQL", async () => {
  config.ANTHROPIC_API_KEY = "test-not-a-real-key";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: '```json\n{"answer":"Suggestion","sql":"SELECT 42","chartConfig":{"type":"bar","data":[{"value":42}]}}\n```',
            },
          ],
        }),
      ),
    ),
  );
  const result = await nlQueryService.processQuery("test");
  expect(result).toMatchObject({
    evidence: "suggestion-only",
    queryExecuted: false,
    provider: "Anthropic",
    data: [],
    chartConfig: null,
    sqlGenerated: "SELECT 42",
  });
});
it("fails clearly when the external provider is not configured", async () => {
  config.ANTHROPIC_API_KEY = "";
  await expect(nlQueryService.processQuery("test")).rejects.toMatchObject({
    code: "NL_NOT_CONFIGURED",
  });
});
