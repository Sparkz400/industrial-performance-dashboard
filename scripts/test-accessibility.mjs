import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { AxeBuilder } from "@axe-core/playwright";
import { dailyFixture } from "./daily-fixture.mjs";

// U06: automated part of docs/ACCESSIBILITY.md. axe covers what can be computed
// (names, roles, contrast, target size); manual screen-reader checks stay listed there.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

await dailyFixture(async ({ pool, users, browser, actors, frontend, password, expect }) => {
  const [{ id: machine }] = (
    await pool.query(
      "INSERT INTO machines(name,endpoint_url,ip,is_active) VALUES ('Accessible press','opc.tcp://127.0.0.1:49984','127.0.0.1',false) RETURNING id",
    )
  ).rows;
  await pool.query("INSERT INTO machine_grants(user_id,machine_id) VALUES($1,$2)", [
    users.operator.id,
    machine,
  ]);
  const report = {};
  const scan = async (page, name) => {
    await page.waitForLoadState("networkidle");
    // Reduced motion still fades opacity in. A fade can still be running on a slow
    // machine, so rescan briefly while contrast findings remain; a real one persists.
    let violations = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      ({ violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze());
      if (!violations.some((v) => v.id === "color-contrast")) break;
      await page.waitForTimeout(1000);
    }
    report[name] = violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      example: v.nodes[0]?.target.join(" "),
      html: v.nodes[0]?.html.slice(0, 160),
      detail: v.nodes[0]?.failureSummary?.slice(0, 200),
    }));
  };

  // Login with the keyboard alone, in a fresh context.
  const anonymous = await browser.newContext({ reducedMotion: "reduce" });
  const login = await anonymous.newPage();
  await login.goto(`${frontend}/login`);
  await scan(login, "login");
  await login.keyboard.press("Tab");
  let guard = 0;
  while (
    !(await login.evaluate(() => document.activeElement?.getAttribute("autocomplete") === "username" || document.activeElement?.getAttribute("name") === "username")) &&
    guard++ < 10
  )
    await login.keyboard.press("Tab");
  await login.keyboard.type("operator");
  await login.keyboard.press("Tab");
  await login.keyboard.type(password);
  await login.keyboard.press("Enter");
  await expect(login).not.toHaveURL(/\/login/);
  // Reduced motion: transitions are effectively removed.
  const duration = await login.evaluate(() => {
    const button = document.querySelector("button");
    return button ? getComputedStyle(button).transitionDuration : "0s";
  });
  assert.ok(
    duration.split(",").every((d) => parseFloat(d) <= 0.0001),
    `transition ${duration} with reduced motion`,
  );

  // Operator screens, including reflow at 320 CSS pixels (400 % zoom of 1280).
  await login.goto(`${frontend}/production`);
  await scan(login, "production shift workspace");
  await login.getByRole("tab", { name: "Operator handover" }).click();
  await scan(login, "operator handover");
  for (const path of ["/login", "/production"]) {
    await login.setViewportSize({ width: 320, height: 640 });
    await login.goto(`${frontend}${path}`);
    await login.waitForLoadState("networkidle");
    const overflow = await login.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    assert.ok(overflow <= 1, `${path} scrolls sideways by ${overflow}px at 320px`);
  }

  // Administrator screens.
  await pool.query(
    "INSERT INTO dashboards(id,name,widgets,layout) VALUES('a11y','Accessible board',$1,$2)",
    [
      JSON.stringify([{ id: "status", type: "systemStatus", config: {} }]),
      JSON.stringify([{ i: "status", x: 0, y: 0, w: 4, h: 6 }]),
    ],
  );
  const admin = await actors.admin.newPage();
  for (const [name, path] of [
    ["dashboards", "/dashboard/a11y"],
    ["machines", "/machines"],
    ["alert rules", "/alerts/rules"],
  ]) {
    await admin.goto(`${frontend}${path}`);
    await scan(admin, name);
  }
  // WCAG 2.2 SC 2.5.7: widgets move and resize without dragging, by keyboard.
  await admin.goto(`${frontend}/dashboard/a11y`);
  await expect(admin.getByRole("button", { name: "Move or resize widget" })).toBeVisible();
  // Let the dashboard's debounced store synchronization run before checking hydration.
  await admin.waitForTimeout(700);
  await expect(admin.getByText("Unsaved changes", { exact: true })).toHaveCount(0);
  await admin.getByRole("button", { name: "Move or resize widget" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("menuitem", { name: "Wider" }).press("Enter");
  await admin.getByRole("menuitem", { name: "Move right" }).press("Enter");
  await admin.keyboard.press("Escape");
  await admin.locator(".react-grid-item").first().hover();
  await expect(admin.getByText("5 x 6")).toBeVisible();
  await expect(admin.getByText("Unsaved changes", { exact: true })).toBeVisible();

  await admin.goto(`${frontend}/production`);
  await admin.getByRole("tab", { name: "Commission machine" }).click();
  await scan(admin, "commissioning");
  // Status changes are announced: the live state and alerts use live regions.
  assert.ok(
    (await admin.locator('[aria-live], [role="status"], [role="alert"]').count()) > 0,
    "No live region for status announcements",
  );

  await writeFile(
    ".local/daily-evidence/accessibility.json",
    JSON.stringify(report, null, 2),
  );
  const violations = Object.entries(report).flatMap(([screen, list]) =>
    list.map((v) => `${screen}: ${v.id} [${v.impact}] (${v.nodes}) ${v.example}`),
  );
  assert.deepEqual(violations, [], "WCAG 2.2 A/AA violations");
  console.log(JSON.stringify({ accessibility: "passed", screens: Object.keys(report).length }));
});
