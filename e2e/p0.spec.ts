import { expect, test } from "@playwright/test";
import { login } from "./login";

test("edge status explicitly disables central history and retains queue visibility", async ({
  page,
}) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Edge Status" }).click();
  await expect(
    page.getByText(/Edge synchronization is disabled/),
  ).toBeVisible();
  await expect(page.getByText(/Retained pending records:/)).toBeVisible();
  await expect(page.getByRole("button", { name: /sync now/i })).toHaveCount(0);
});

test("trend API rejects ambiguous machine scope and accepts an empty scoped window", async ({
  page,
}) => {
  await login(page);
  const api = process.env.E2E_API_URL || "http://localhost:3001";
  const query =
    "nodeKeys=NeverConfiguredP0Fixture&startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-01T00:01:00.000Z";
  const ambiguous = await page.request.get(
    `${api}/api/v1/trending/data?${query}`,
  );
  expect(ambiguous.status()).toBe(400);
  const scoped = await page.request.get(
    `${api}/api/v1/trending/data?${query}&machineId=2147483647`,
  );
  expect(scoped.ok()).toBe(true);
  expect((await scoped.json()).series[0]).toMatchObject({
    machineId: 2147483647,
    sampleCount: 0,
    data: [],
    continuity: "unverified",
  });
});

test("dashboard has no AI assistant", async ({ page }) => {
  await login(page);
  await expect(
    page.getByRole("button", { name: "Open AI suggestions" }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("Ask for a suggestion...")).toHaveCount(0);
});

test("trend UI consumes the API envelope and exposes quality and resolution", async ({
  page,
}) => {
  // Synthetic response fixture; database semantics are tested separately in test-p0.mjs.
  const start = "2026-01-01T00:00:00.000Z";
  await page.route("**/api/v1/dashboards", async (route) =>
    route.fulfill({
      json: [
        {
          id: "p0-browser-fixture",
          name: "P0 synthetic trend",
          widgets: [
            {
              id: "p0-trend",
              type: "trendingExplorer",
              config: { machineId: 987654, defaultTags: ["Dense"] },
            },
          ],
          layout: [{ i: "p0-trend", x: 0, y: 0, w: 12, h: 10 }],
        },
      ],
    }),
  );
  await page.route("**/api/v1/dashboards/p0-browser-fixture", async (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route("**/api/v1/trending/available-tags/**", async (route) =>
    route.fulfill({
      json: [{ nodeKey: "Dense", displayName: "Dense", dataType: "Double" }],
    }),
  );
  await page.route("**/api/v1/trending/data?**", async (route) =>
    route.fulfill({
      json: {
        series: [
          {
            nodeKey: "Dense",
            displayName: "Dense",
            machineId: 987654,
            resolutionMs: 3000,
            truncated: false,
            sampleCount: 5001,
            goodSampleCount: 5000,
            legacySampleCount: 1,
            observedEnd: "2026-01-01T00:00:09.000Z",
            continuity: "unverified",
            data: [
              { timestamp: start, value: 0, statusCode: "Good" },
              {
                timestamp: "2026-01-01T00:00:03.000Z",
                value: 10,
                statusCode: "Good",
              },
              {
                timestamp: "2026-01-01T00:00:06.000Z",
                value: null,
                statusCode: "MixedOrBad",
              },
              {
                timestamp: "2026-01-01T00:00:09.000Z",
                value: 20,
                statusCode: "Good",
              },
            ],
          },
        ],
      },
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await expect(page.getByText(/5000\/5001 usable samples/)).toBeVisible();
  await expect(page.getByText(/3000 ms buckets/)).toBeVisible();
  await expect(
    page.getByText(/Continuity between samples is not verified/),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Dense [Dense]" }),
  ).toBeChecked();
  await page.getByRole("checkbox", { name: "Dense [Dense]" }).uncheck();
  await expect(page.getByText("All series hidden")).toBeVisible();
  await page.getByRole("checkbox", { name: "Dense [Dense]" }).check();
  expect(errors).toEqual([]);
});
