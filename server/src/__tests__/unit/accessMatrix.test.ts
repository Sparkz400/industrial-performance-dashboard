/**
 * F07 access matrix: every mounted REST route and tRPC procedure, every non-admin role,
 * with a granted identifier (1), a foreign identifier (2) and no identifier.
 * Router-level role gates can narrow these results further; they never widen them.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  concretePath,
  routeInventory,
  serverRoot as server,
} from "../helpers/routeInventory.js";

vi.mock("../../database/db.js", () => ({
  default: {},
  getReadDb: () => ({}),
  getWriteDb: () => ({}),
}));
vi.mock("../../services/sessionAccess.js", async (original) => ({
  ...(await original<typeof import("../../services/sessionAccess.js")>()),
  getSessionUser: async (session: { userId?: number; userRole?: string }) =>
    session.userId ? { id: session.userId, role: session.userRole } : null,
}));
vi.mock("../../services/accessScope.js", async (original) => {
  const actual =
    await original<typeof import("../../services/accessScope.js")>();
  const { ForbiddenError } = await import("../../utils/errors.js");
  return {
    ...actual,
    loadAccessScope: async (userId: number, role: string) => ({
      userId,
      role,
      machineIds: role === "admin" ? [] : [1],
      dashboardIds: role === "admin" ? [] : ["1"],
    }),
    // Resource identifiers double as their parent machine: 1 is granted, 2 is not.
    assertResource: async (_kind: string, id: unknown) => {
      if (!/^\d+$/.test(String(id)))
        throw new ForbiddenError("Invalid resource identifier");
      actual.assertMachine(Number(id));
    },
  };
});

import { accessScope, type AccessScope } from "../../services/accessScope.js";
import { authorizeAssetRequest } from "../../middleware/assetAccess.js";
import { requireMutationAccess, type UserRole } from "../../middleware/auth.js";
import { appRouter } from "../../trpc/index.js";

const ROLES: UserRole[] = ["viewer", "wallboard", "operator", "supervisor"];

async function allowed(
  role: UserRole,
  method: string,
  template: string,
  id: "1" | "2" | null,
) {
  const path = concretePath(template, id ?? "1");
  const gate = await new Promise<unknown>((resolve) =>
    requireMutationAccess(
      { method, path, originalUrl: path, session: { userRole: role } } as never,
      {} as never,
      resolve,
    ),
  );
  if (gate) return false;
  const scope: AccessScope = {
    userId: 9,
    role,
    machineIds: [1],
    dashboardIds: ["1"],
  };
  const query = id ? { machineId: id, ids: id, dashboardId: id } : {};
  const body = id ? { machineId: Number(id) } : {};
  try {
    await accessScope.run(scope, () =>
      authorizeAssetRequest(method, path, query, body),
    );
    return true;
  } catch (error) {
    if ([403, 404].includes((error as { statusCode?: number }).statusCode ?? 0))
      return false;
    throw error;
  }
}

const { mounts, routes } = routeInventory();
const policyRoutes = routes.filter(
  (route) => !/^\/(auth|share)(\/|$)/.test(route.path),
);

describe("REST access matrix", () => {
  it("inventories every mounted router", () => {
    expect(mounts.length).toBeGreaterThan(40);
    for (const mount of mounts)
      expect(
        routes.some((route) => route.path.startsWith(mount.prefix)),
        mount.prefix,
      ).toBe(true);
    const routeFiles = readdirSync(join(server, "src/routes")).filter(
      (f) => f.endsWith("Routes.ts") || f === "alertRoutes2.ts",
    );
    const app = readFileSync(join(server, "app.ts"), "utf8");
    const nested = readFileSync(
      join(server, "src/routes/historyRoutes.ts"),
      "utf8",
    );
    for (const file of routeFiles)
      expect(
        app.includes(`/routes/${file.replace(".ts", ".js")}`) ||
          nested.includes(`./${file.replace(".ts", ".js")}`),
        `${file} is mounted`,
      ).toBe(true);
    expect(policyRoutes.length).toBeGreaterThan(200);
  });

  it("lets foreign identifiers reach only reviewed handler-checked routes", async () => {
    // Identifier-free lists apply machineScope/dashboardScope (test-access.mjs). Supervisor
    // line and action handlers assert every referenced machine (test-supervisor-workflows.mjs).
    const listed = [
      "GET /access/me",
      "GET /dashboards",
      "GET /production/assets",
      "GET /production/operator/owners",
      "GET /production/shifts",
    ];
    const supervisorChecked = [
      "GET /lines",
      "GET /lines/:id/report",
      "GET /maintenance-actions/machines/:id",
      "GET /maintenance-actions/machines/:id/owners",
      "POST /lines",
      "POST /maintenance-actions/:id/complete",
      "POST /maintenance-actions/:id/revise",
      "POST /maintenance-actions/machines/:id",
    ];
    for (const role of ROLES) {
      const passed: string[] = [];
      for (const { method, path } of policyRoutes)
        if (await allowed(role, method, path, "2"))
          passed.push(`${method} ${path}`);
      expect(passed.sort(), role).toEqual(
        [...listed, ...(role === "supervisor" ? supervisorChecked : [])].sort(),
      );
    }
  });

  it("keeps viewer and wallboard accounts read-only", async () => {
    const writes: string[] = [];
    for (const role of ["viewer", "wallboard"] as UserRole[])
      for (const { method, path } of policyRoutes)
        if (method !== "GET" && (await allowed(role, method, path, "1")))
          writes.push(`${role} ${method} ${path}`);
    expect(writes).toEqual([]);
  });

  it("limits identifier-free access to routes whose handlers apply the account scope", async () => {
    const unscoped = new Set<string>();
    for (const role of ROLES)
      for (const { method, path } of policyRoutes)
        if (!path.includes(":") && (await allowed(role, method, path, null)))
          unscoped.add(`${method} ${path}`);
    // Each handler below filters by machineScope/dashboardScope or asserts every referenced machine.
    expect([...unscoped].sort()).toEqual([
      "GET /access/me",
      "GET /alarms",
      "GET /alarms/rules",
      "GET /alerts/history",
      "GET /alerts/rules",
      "GET /dashboards",
      "GET /lines",
      "GET /production/assets",
      "GET /production/operator/owners",
      "GET /production/shifts",
      "POST /lines",
    ]);
  });

  it("matches the reviewed per-role matrix", async () => {
    const matrix: Record<string, string[]> = {};
    for (const role of ROLES) {
      const granted = new Set<string>();
      for (const { method, path } of policyRoutes)
        if (
          (await allowed(role, method, path, "1")) ||
          (await allowed(role, method, path, null))
        )
          granted.add(`${method} ${path}`);
      matrix[role] = [...granted].sort();
    }
    expect(matrix.wallboard).toEqual(matrix.viewer);
    expect(matrix).toMatchSnapshot();
  });
});

describe("tRPC access matrix", () => {
  const procedures = Object.keys(
    (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })
      ._def.procedures,
  ).sort();
  const call = async (role: UserRole, path: string, input: unknown) => {
    const caller = appRouter.createCaller({
      session: { userId: 9, userRole: role },
    }) as unknown as Record<
      string,
      Record<string, (input: unknown) => Promise<unknown>>
    >;
    const [group, name] = path.split(".");
    try {
      await caller[group][name](input);
      return "ok";
    } catch (error) {
      return (error as { code?: string }).code ?? "error";
    }
  };

  it("lists the procedures this matrix covers", () => {
    expect(procedures).toMatchSnapshot();
  });

  it("rejects foreign identifiers and non-administrator procedures", async () => {
    const foreign = { id: 2, machineId: 2, dashboardId: "2", nodeKey: "Count" };
    for (const role of ROLES) {
      const passed: string[] = [];
      for (const path of procedures)
        if ((await call(role, path, foreign)) !== "FORBIDDEN")
          passed.push(path);
      // dashboard.list has no identifiers; its resolver applies dashboardScope.
      expect(passed, role).toEqual(["dashboard.list"]);
    }
  });

  it("allows granted reads and operator acknowledgement only", async () => {
    const own = { id: 1, machineId: 1, dashboardId: "1", nodeKey: "Count" };
    for (const role of ROLES) {
      const passed: string[] = [];
      for (const path of procedures)
        if ((await call(role, path, own)) !== "FORBIDDEN") passed.push(path);
      expect(passed, role).toEqual(
        [
          "alarm.list",
          "alarm.listRules",
          ...(["operator", "supervisor"].includes(role)
            ? ["alarm.acknowledge"]
            : []),
          "annotation.list",
          "dashboard.getById",
          "dashboard.list",
          "nodeData.aggregates",
          "nodeData.history",
        ].sort(),
      );
    }
  });
});

it("never broadcasts socket events to every connection", () => {
  const broadcast = /\bio\.emit\(/;
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(file);
      } else if (
        file.endsWith(".ts") &&
        broadcast.test(readFileSync(file, "utf8"))
      )
        offenders.push(file);
    }
  };
  walk(join(server, "src"));
  if (broadcast.test(readFileSync(join(server, "app.ts"), "utf8")))
    offenders.push("app.ts");
  expect(offenders).toEqual([]);
});
