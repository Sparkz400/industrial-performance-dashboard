import { expect, test } from "@playwright/test";
import { login } from "./login";

test("rejects a state-changing request without CSRF even with a signed-in session", async ({
  page,
}) => {
  await login(page);
  const api = process.env.E2E_API_URL || "http://localhost:3001";
  const response = await page.request.post(`${api}/api/v1/machines`, {
    data: {
      name: "Must not be created",
      ip: "localhost",
      port: 4841,
      isActive: false,
    },
  });
  expect(response.status()).toBe(403);
});
