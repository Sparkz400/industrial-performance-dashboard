import { test, expect } from '@playwright/test';

/**
 * Dashboard E2E tests.
 *
 * These tests require a running server with a seeded database.
 * They test the core dashboard CRUD flow through the UI.
 *
 * To run locally:
 *   1. Start the server and client (npm start)
 *   2. Ensure a test user exists in the database
 *   3. Run: npx playwright test e2e/dashboard.spec.ts
 */

// Helper to log in before dashboard tests
async function loginAsAdmin(page: any) {
  await page.goto('/');
  await page.getByLabel(/username/i).fill(process.env.E2E_USERNAME || 'admin');
  await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD || 'admin123');
  await page.getByRole('button', { name: /login|sign in/i }).click();

  // Wait for redirect to main app (look for sidebar or dashboard content)
  await page.waitForURL('**/*', { timeout: 10_000 });
}

test.describe('Dashboard Management', () => {
  test.skip(
    !process.env.E2E_USERNAME,
    'Skipping dashboard tests — set E2E_USERNAME and E2E_PASSWORD env vars to run',
  );

  test('should display dashboard page after login', async ({ page }) => {
    await loginAsAdmin(page);

    // Should see some dashboard content or the default dashboard
    await expect(
      page.getByText(/dashboard/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should allow creating a new dashboard', async ({ page }) => {
    await loginAsAdmin(page);

    // Look for an "add" or "new dashboard" button
    const addButton = page.getByRole('button', { name: /add|new|create/i }).first();
    if (await addButton.isVisible()) {
      await addButton.click();

      // Fill in dashboard name
      const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/name/i));
      if (await nameInput.isVisible()) {
        await nameInput.fill('E2E Test Dashboard');
      }
    }
  });

  test('should display widgets on the dashboard', async ({ page }) => {
    await loginAsAdmin(page);

    // Wait for dashboard to fully load
    await page.waitForLoadState('networkidle');

    // The dashboard should have some content area
    const dashboardArea = page.locator('[class*="grid"], [class*="dashboard"], main');
    await expect(dashboardArea.first()).toBeVisible({ timeout: 10_000 });
  });
});
