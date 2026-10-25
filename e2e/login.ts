import { expect, type Page } from "@playwright/test";

export async function login(page: Page) {
  if (!process.env.E2E_PASSWORD)
    throw new Error("Set E2E_PASSWORD or SEED_ADMIN_PASSWORD");
  await page.goto("/");
  await page.getByLabel(/username/i).fill(process.env.E2E_USERNAME || "admin");
  await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("tablist", { name: "dashboard tabs" }),
  ).toBeVisible();
}
