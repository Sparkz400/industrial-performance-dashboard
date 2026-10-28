import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dailyFixture } from "./daily-fixture.mjs";
const require = createRequire(import.meta.url);
await dailyFixture(async ({ frontend, api, password }) => {
  await new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [require.resolve("@playwright/test/cli"), "test", "--workers=1"],
      {
        windowsHide: true,
        stdio: ["ignore", "inherit", "inherit"],
        env: {
          ...process.env,
          E2E_EXTERNAL_SERVER: "1",
          E2E_BASE_URL: frontend,
          E2E_API_URL: api,
          E2E_USERNAME: "admin",
          E2E_PASSWORD: password,
        },
      },
    );
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0
        ? done()
        : fail(new Error(`Browser regression suite failed (${code})`)),
    );
  });
});
