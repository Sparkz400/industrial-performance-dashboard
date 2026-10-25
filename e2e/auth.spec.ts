import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test("should display login page when not authenticated", async ({ page }) => {
    await page.goto("/");

    // Should redirect to login or show login form
    await expect(
      page
        .getByRole("heading", { name: /login|sign in/i })
        .or(page.getByRole("button", { name: /login|sign in/i })),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should prevent submitting an empty login form", async ({ page }) => {
    await page.goto("/");

    // Wait for login page to load
    const loginButton = page.getByRole("button", { name: /login|sign in/i });
    await expect(loginButton).toBeVisible({ timeout: 10_000 });

    await expect(loginButton).toBeDisabled();
    await page.getByLabel(/username/i).fill("admin");
    await expect(loginButton).toBeDisabled();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/");

    // Fill in invalid credentials
    await page.getByLabel(/username/i).fill("invaliduser");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /login|sign in/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("should have username and password fields", async ({ page }) => {
    await page.goto("/");

    const usernameField = page.getByLabel(/username/i);
    const passwordField = page.getByLabel(/password/i);

    await expect(usernameField).toBeVisible({ timeout: 10_000 });
    await expect(passwordField).toBeVisible();
  });
});
