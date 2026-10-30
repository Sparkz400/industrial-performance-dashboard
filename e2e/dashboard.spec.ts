import { test, expect, type Locator, type Page } from "@playwright/test";
import { login } from "./login";

async function drag(page: Page, from: Locator, dx: number, dy: number) {
  const box = (await from.boundingBox())!;
  const [x, y] = [
    box.x + Math.min(box.width / 2, 40),
    box.y + Math.min(box.height / 2, 20),
  ];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

test("an untouched dashboard has no unsaved changes until it is dragged or resized", async ({
  page,
}) => {
  await login(page);
  const api = (process.env.E2E_API_URL || "http://localhost:3001") + "/api/v1";
  const id = `e2e-untouched-${Date.now()}`;
  const token = await (await page.request.get(`${api}/csrf-token`)).json();
  const headers = { "x-csrf-token": token.csrfToken };
  // Stored the way imports and older clients leave it: no registry minW/minH.
  const created = await page.request.post(`${api}/dashboards/${id}`, {
    headers,
    data: {
      name: "Untouched",
      widgets: [{ id: "c", type: "systemStatus", config: {} }],
      layout: [{ i: "c", x: 0, y: 0, w: 4, h: 6 }],
    },
  });
  expect(created.ok()).toBe(true);
  const banner = page.getByText("Unsaved changes", { exact: true });
  const save = page.getByRole("button", { name: "Save", exact: true });
  const savedLayout = async () =>
    (await (await page.request.get(`${api}/dashboards/${id}`)).json())
      .layout[0];
  const staysClean = async () => {
    await page.waitForTimeout(1500); // well past the 300 ms widget/layout sync debounce
    await expect(banner).toBeHidden();
    await expect(save).toBeDisabled();
  };
  const saveWith = async (button: Locator) => {
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith(`/dashboards/${id}`),
    );
    await button.click();
    expect((await response).ok()).toBe(true);
    await staysClean();
  };
  try {
    await page.goto(`/dashboard/${id}`);
    const item = page.locator(".react-grid-item").first();
    await expect(item).toBeVisible();
    await staysClean();

    await drag(page, item, (await item.boundingBox())!.width, 0);
    await expect(banner).toBeVisible();
    await expect(save).toBeEnabled();
    await saveWith(page.getByRole("button", { name: "Save Now", exact: true }));
    expect((await savedLayout()).x).toBeGreaterThan(0);

    await drag(page, item.locator(".react-resizable-handle"), 0, 150);
    await expect(banner).toBeVisible();
    await saveWith(save);
    expect((await savedLayout()).h).toBeGreaterThan(6);

    await page.reload();
    await expect(item).toBeVisible();
    await staysClean();
  } finally {
    await page.request.delete(`${api}/dashboards/${id}`, { headers });
  }
});

test("creates a dashboard that survives reload", async ({ page }) => {
  await login(page);
  const tabs = page.getByRole("tablist", { name: "dashboard tabs" });
  const originalCount = await tabs.getByRole("tab").count();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(tabs.getByRole("tab")).toHaveCount(originalCount + 1);
  await expect(
    page.getByText("Dashboard saved successfully", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(tabs.getByRole("tab")).toHaveCount(originalCount + 1);
  const created = tabs.getByRole("tab").last();
  await page
    .getByRole("button", { name: "Add Widget", exact: true })
    .first()
    .click();
  await expect(page.getByText("Widget Library", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "close widget library", exact: true })
    .click();
  await created.focus();
  await page.keyboard.press("Delete");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /delete/i })
    .click();
  await expect(tabs.getByRole("tab")).toHaveCount(originalCount);
  await expect(
    page.getByText("Dashboard deleted successfully", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(tabs.getByRole("tab")).toHaveCount(originalCount);
});
