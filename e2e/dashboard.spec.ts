import { test, expect } from "@playwright/test";
import { login } from "./login";

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
  await created.locator('[data-testid="CloseIcon"]').click();
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
