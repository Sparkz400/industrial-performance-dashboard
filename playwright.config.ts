import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
dotenv.config({ path: "server/.env", quiet: true });
process.env.E2E_USERNAME ||= "admin";
process.env.E2E_PASSWORD ||= process.env.SEED_ADMIN_PASSWORD;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "npm run start:server",
      url: "http://127.0.0.1:3001/api/v1/csrf-token",
      reuseExistingServer: !process.env.CI,
      timeout: 90_000,
    },
    {
      command: "npm run start:client",
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
