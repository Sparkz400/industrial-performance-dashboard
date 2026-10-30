import { selectSettings } from "../scripts/browser-navigation.mjs";
import { test, expect, type Page } from "@playwright/test";
import type { MachineLiveSummary } from "@performance-dashboard/shared";

// Render the real application with owned fixtures; no machine or database is contacted.
test.use({ serviceWorkers: "block" });

async function fixtures(page: Page) {
  let signedIn = false;
  const user = { id: 1, username: "Industrial UI fixture", role: "admin" };
  const now = new Date().toISOString();
  const profile = {
    id: 1,
    name: "Fixture pressure",
    machineId: 1,
    nodeKey: "Pressure",
    method: "zscore",
    sensitivity: 3,
    mean: 50,
    ucl: 60,
    lcl: 40,
  };
  const points = [45, 52, null, 55, 50].map((value, index) => ({
    timestamp: new Date(Date.now() - (4 - index) * 60000).toISOString(),
    value,
    statusCode: value === null ? "Bad" : "Good",
    isAnomaly: false,
  }));
  const dashboard = {
    id: "industrial-fixture",
    name: "Industrial UI · synthetic data",
    widgets: [
      {
        id: "trend",
        type: "trendingExplorer",
        config: { machineId: 1, defaultTags: ["Pressure"] },
      },
    ],
    layout: [{ i: "trend", x: 0, y: 0, w: 12, h: 10 }],
  };
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.routeWebSocket(/\/socket\.io\//, (socket) => socket.close());
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    let json: unknown = [];
    let status = 200;
    if (path === "/csrf-token") json = { csrfToken: "industrial-fixture" };
    else if (path === "/auth/login") {
      signedIn = true;
      json = { user };
    } else if (path === "/auth/logout") {
      signedIn = false;
      json = {};
    } else if (path === "/auth/me") {
      json = signedIn ? { user } : { message: "Sign in" };
      status = signedIn ? 200 : 401;
    } else if (path === "/dashboards") json = [dashboard];
    else if (path.startsWith("/dashboards/")) json = dashboard;
    else if (path === "/machines")
      json = [
        {
          id: 1,
          name: "Fixture machine",
          status: "disconnected",
          isActive: false,
        },
      ];
    else if (path.startsWith("/trending/available-tags"))
      json = [
        { nodeKey: "Pressure", displayName: "Pressure", dataType: "Double" },
      ];
    else if (path === "/trending/data")
      json = {
        series: [
          {
            nodeKey: "Pressure",
            displayName: "Pressure",
            machineId: 1,
            resolutionMs: 0,
            truncated: false,
            sampleCount: 5,
            goodSampleCount: 4,
            legacySampleCount: 0,
            observedEnd: now,
            continuity: "unverified",
            data: points,
          },
        ],
      };
    else if (path === "/spc/profiles") json = [profile];
    else if (path.endsWith("/chart-data"))
      json = {
        profile,
        dataPoints: points.filter((p) => p.value !== null),
        mean: 50,
        ucl: 60,
        lcl: 40,
      };
    else if (path === "/spc/profiles/1") json = profile;
    else if (path.endsWith("/control-chart")) {
      // The fixture profile declares no data assumption, as the server reports.
      status = 400;
      json = {
        status: "error",
        error: "Declare the data assumption before using a control chart",
        code: "VALIDATION_ERROR",
      };
    } else if (path === "/production/assets")
      json = [{ id: 1, name: "Fixture machine" }];
    else if (path === "/production/operator/live")
      json = {
        checkedAt: now,
        machines: [
          {
            id: 1,
            name: "Fixture machine",
            state: "unknown",
            freshness: "missing",
            connection: "disconnected",
            lastMeasurement: null,
            receivedAt: null,
            shift: null,
            production: {
              observed: null,
              complete: false,
              truncated: false,
              asOf: null,
            },
            issues: [
              {
                id: 1,
                text: "No measurements",
                priority: "normal",
                dueAt: null,
                kind: "note",
              },
            ],
          } satisfies MachineLiveSummary,
        ],
      };
    await route.fulfill({ status, json });
  });
}

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username").fill("fixture");
  await page
    .getByLabel("Password", { exact: false })
    .first()
    .fill("fixture-only");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/dashboards");
  await expect(
    page.getByRole("checkbox", { name: "Pressure [Pressure]" }),
  ).toBeVisible();
}

for (const mode of ["light", "dark"] as const) {
  test(`${mode}: dashboard, charts, dialogs, settings and mobile retain working controls`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fixtures(page);
    await page.addInitScript((mode) => {
      localStorage.setItem("themeMode", mode);
      localStorage.setItem("useSystemTheme", "false");
    }, mode);
    await page.goto("/");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      mode === "dark" ? "rgb(36, 44, 49)" : "rgb(215, 220, 222)",
    );
    await expect(page.getByLabel("Username")).toHaveCSS(
      "font-family",
      /Figtree/,
    );
    expect(
      await page.evaluate(async () => {
        await document.fonts.ready;
        return [400, 500, 600, 700].every((weight) =>
          document.fonts.check(`${weight} 16px Figtree`),
        );
      }),
    ).toBe(true);
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(
      page.locator('input[autocomplete="current-password"]'),
    ).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await page.screenshot({ path: testInfo.outputPath(`login-${mode}.png`) });
    await signIn(page);
    await expect(page.getByText(/4\/5 usable samples/)).toBeVisible();
    await expect(
      page.getByText(/Continuity between samples is not verified/),
    ).toBeVisible();
    await expect(page.locator("svg text").first()).toHaveCSS(
      "font-family",
      /Figtree/,
    );
    await page.getByRole("checkbox", { name: "Pressure [Pressure]" }).uncheck();
    await expect(page.getByText("All series hidden")).toBeVisible();
    await page.getByRole("checkbox", { name: "Pressure [Pressure]" }).check();
    await page
      .getByRole("button", { name: "Widget Settings", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByRole("button", { name: "Exit fullscreen", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Move or resize widget" }).click();
    await page.getByRole("menuitem", { name: "Taller" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("Dashboard saved successfully", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${mode}.png`),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Export / Share", exact: true })
      .last()
      .click();
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("menuitem", { name: "Export as PNG", exact: true })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    await download.saveAs(testInfo.outputPath(`exported-widget-${mode}.png`));
    await page.getByRole("button", { name: "Dashboard Templates" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`templates-${mode}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Add Widget", exact: true }).click();
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible();
    await page.getByPlaceholder(/search by name/i).fill("OEE");
    await page.screenshot({ path: testInfo.outputPath(`widgets-${mode}.png`) });
    await page.keyboard.press("Escape");
    await page.goto("/spc");
    await expect(
      page.getByRole("cell", { name: "Fixture pressure", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "View Chart" }).click();
    await expect(
      page.locator("svg text").filter({ hasText: "UCL" }),
    ).toBeVisible();
    await expect(page.locator("svg text").first()).toHaveCSS(
      "font-family",
      /Figtree/,
    );
    await page.screenshot({ path: testInfo.outputPath(`spc-${mode}.png`) });
    await page.goto("/settings");
    await selectSettings(page, "Appearance");
    await expect(
      page.getByRole("button", {
        name: mode === "dark" ? "Dark" : "Light",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({
      path: testInfo.outputPath(`settings-${mode}.png`),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboards");
    await expect(
      page.getByRole("checkbox", { name: "Pressure [Pressure]" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`mobile-dashboard-${mode}.png`),
      fullPage: true,
    });
    const saveNotice = page.getByRole("button", {
      name: "Save Now",
      exact: true,
    });
    if (await saveNotice.isVisible()) {
      const saveBounds = await saveNotice.boundingBox();
      const addBounds = await page
        .getByRole("button", { name: "Add Widget", exact: true })
        .boundingBox();
      expect(saveBounds!.y + saveBounds!.height).toBeLessThan(addBounds!.y);
    }
    await page.getByRole("button", { name: "Add Widget", exact: true }).click();
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/wallboard");
    await expect(
      page.getByText("Production wallboard", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Unknown", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`wallboard-mobile-${mode}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("theme selection works by keyboard, persists and follows system appearance", async ({
  page,
}) => {
  await fixtures(page);
  await signIn(page);
  await page.goto("/settings");
  await selectSettings(page, "Appearance");
  const light = page.getByRole("button", { name: "Light", exact: true });
  await light.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(215, 220, 222)",
  );
  expect(await page.evaluate(() => localStorage.getItem("themeMode"))).toBe(
    "light",
  );
  await page.reload();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(215, 220, 222)",
  );
  await selectSettings(page, "Appearance");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(36, 44, 49)",
  );
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(215, 220, 222)",
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(36, 44, 49)",
  );
});
