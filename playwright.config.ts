import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Start the dev servers before running E2E tests (local only) */
  ...(process.env.CI
    ? {}
    : {
        webServer: [
          {
            command: 'npm run start:server',
            port: 3000,
            reuseExistingServer: true,
            timeout: 30_000,
          },
          {
            command: 'npm run start:client',
            port: 5173,
            reuseExistingServer: true,
            timeout: 30_000,
          },
        ],
      }),
});
