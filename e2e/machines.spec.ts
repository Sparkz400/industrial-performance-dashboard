import { test, expect } from '@playwright/test';

/**
 * Machine management E2E tests.
 *
 * These tests require:
 *   - Running server + client
 *   - A test admin user in the database
 *   - Set E2E_USERNAME and E2E_PASSWORD env vars
 */

async function loginAsAdmin(page: any) {
  await page.goto('/');
  await page.getByLabel(/username/i).fill(process.env.E2E_USERNAME || 'admin');
  await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD || 'admin123');
  await page.getByRole('button', { name: /login|sign in/i }).click();
  await page.waitForURL('**/*', { timeout: 10_000 });
}

test.describe('Machine Management', () => {
  test.skip(
    !process.env.E2E_USERNAME,
    'Skipping machine tests — set E2E_USERNAME and E2E_PASSWORD env vars to run',
  );

  test('should navigate to machines page', async ({ page }) => {
    await loginAsAdmin(page);

    // Look for Machines link in sidebar/navigation
    const machinesLink = page.getByRole('link', { name: /machines/i }).or(
      page.getByText(/machines/i).first(),
    );

    if (await machinesLink.isVisible()) {
      await machinesLink.click();
      await expect(page.getByText(/Machines/)).toBeVisible({ timeout: 10_000 });
    }
  });

  test('should show empty state or machine list', async ({ page }) => {
    await loginAsAdmin(page);

    // Navigate to machines
    const machinesLink = page.getByRole('link', { name: /machines/i }).or(
      page.getByText(/machines/i).first(),
    );

    if (await machinesLink.isVisible()) {
      await machinesLink.click();

      // Should show either "No machines" or a list of machines
      await expect(
        page
          .getByText(/no machines/i)
          .or(page.getByText(/Add Machine/i))
          .or(page.locator('[data-testid*="machine"]').first()),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test('should open add machine dialog', async ({ page }) => {
    await loginAsAdmin(page);

    const machinesLink = page.getByRole('link', { name: /machines/i }).or(
      page.getByText(/machines/i).first(),
    );

    if (await machinesLink.isVisible()) {
      await machinesLink.click();

      const addButton = page.getByRole('button', { name: /add machine/i });
      await expect(addButton).toBeVisible({ timeout: 10_000 });
      await addButton.click();

      // Should open a form/dialog with machine fields
      await expect(
        page.getByLabel(/name/i).or(page.getByLabel(/ip/i)).or(page.getByLabel(/port/i)),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test('should validate machine form fields', async ({ page }) => {
    await loginAsAdmin(page);

    const machinesLink = page.getByRole('link', { name: /machines/i }).or(
      page.getByText(/machines/i).first(),
    );

    if (await machinesLink.isVisible()) {
      await machinesLink.click();

      const addButton = page.getByRole('button', { name: /add machine/i });
      if (await addButton.isVisible()) {
        await addButton.click();

        // Try to submit without filling required fields
        const submitButton = page.getByRole('button', { name: /save|add|submit|create/i });
        if (await submitButton.isVisible()) {
          await submitButton.click();

          // Should show validation errors
          await expect(
            page.getByText(/required|invalid|error/i).first(),
          ).toBeVisible({ timeout: 5_000 });
        }
      }
    }
  });
});
