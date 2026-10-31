import type { RequestHandler } from "express";
import type {} from "./auth.js";
import {
  accessScope,
  loadAccessScope,
  assertMachine,
  assertDashboard,
  assertResource,
  canOperate,
  canSupervise,
} from "../services/accessScope.js";
import { ForbiddenError } from "../utils/errors.js";

/** Explicit allowlist: newly mounted APIs start administrator-only. */
export const requireAssetAccess: RequestHandler = async (req, _res, next) => {
  try {
    const scope = await loadAccessScope(
      req.session.userId!,
      req.session.userRole!,
    );
    await accessScope.run(scope, async () => {
      await authorizeAssetRequest(
        req.method,
        req.path,
        req.query as Record<string, unknown>,
        req.body ?? {},
      );
      next();
    });
  } catch (error) {
    next(error);
  }
};

export async function authorizeAssetRequest(
  method: string,
  path: string,
  query: Record<string, unknown> = {},
  body: Record<string, unknown> = {},
) {
  const scope = accessScope.getStore();
  if (!scope) throw new ForbiddenError("Missing access context");
  if (scope.role === "admin") return;
  path = path.replace(/\/+$/, "") || "/";
  const read = ["GET", "HEAD"].includes(method);
  const match = (expression: RegExp) => expression.exec(path);
  const denied = () => {
    throw new ForbiddenError(
      "This operation is not permitted for your role or assets",
    );
  };
  let found: RegExpExecArray | null;
  if (read && path === "/access/me") return;
  if (read && path === "/widget-runtime/registrations") return;
  // E03: the handler lists only sites with machines in the caller's scope.
  if (read && path === "/edges/overview") return;
  if (read && (found = match(/^\/plc-alarms\/machines\/(\d+)$/))) {
    assertMachine(found[1]);
    return;
  }
  if (read && (found = match(/^\/widget-evidence\/machines\/(\d+)$/))) {
    assertMachine(found[1]);
    return;
  }
  if (
    (found = match(/^\/derived-signals\/machines\/(\d+)(?:\/\d+\/evaluate)?$/))
  ) {
    if (!read && (method !== "POST" || !canSupervise(scope.role))) denied();
    assertMachine(found[1]);
    return;
  }
  if (
    (found = match(
      /^\/cmms\/machines\/(\d+)\/(destinations|preview|handoffs)$/,
    ))
  ) {
    if (!canSupervise(scope.role) || (!read && method !== "POST")) denied();
    assertMachine(found[1]);
    return;
  }
  if ((found = match(/^\/energy-costs\/machines\/(\d+)\/tariffs$/))) {
    if (!read && (method !== "POST" || !canSupervise(scope.role))) denied();
    assertMachine(found[1]);
    return;
  }
  if (read && (found = match(/^\/energy-costs\/shifts\/(\d+)$/))) {
    await assertResource("shift", found[1]);
    return;
  }
  if (
    (found = match(
      /^\/history\/(\d+)\/(measurements|corrections)(?:\/preview)?$/,
    ))
  ) {
    if (!read && (method !== "POST" || !canSupervise(scope.role))) denied();
    assertMachine(found[1]);
    return;
  }
  if (read && path === "/digital-twins/instances") {
    assertMachine(query.machineId);
    return;
  }
  if (
    read &&
    (found = match(/^\/digital-twins\/instances\/(\d+)(?:\/element-history)?$/))
  ) {
    await assertResource("twin", found[1]);
    return;
  }
  if (
    canSupervise(scope.role) &&
    (found = match(
      /^\/work-orders\/machines\/(\d+)\/(preview|apply|completions)$/,
    )) &&
    ((read && found[2] === "completions") ||
      (method === "POST" && ["preview", "apply"].includes(found[2])))
  ) {
    assertMachine(found[1]);
    return;
  }
  if (
    read &&
    canSupervise(scope.role) &&
    (found = match(
      /^\/(diagnostics|alarm-review)\/machines\/(\d+)(?:\/replay\/\d+)?$/,
    ))
  ) {
    assertMachine(found[2]);
    return;
  }
  if (
    canSupervise(scope.role) &&
    (found = match(
      /^\/comparisons\/machines\/(\d+)(\/revisions|\/actions)?$/,
    )) &&
    (read || (method === "POST" && found[2] === "/actions"))
  ) {
    assertMachine(found[1]);
    return;
  }
  // X04/X06: supervisor reads, decisions and usefulness events for one granted machine.
  if (
    canSupervise(scope.role) &&
    ((found = match(/^\/forecasts\/machines\/(\d+)\/completion$/)) ||
      (found = match(
        /^\/recommendations\/machines\/(\d+)(\/decisions|\/usefulness)?$/,
      ))) &&
    (read ||
      (method === "POST" && ["/decisions", "/usefulness"].includes(found[2])))
  ) {
    assertMachine(found[1]);
    return;
  }
  // These routes validate line membership or the action's machine before accessing data.
  if (
    canSupervise(scope.role) &&
    ((path === "/lines" && (read || method === "POST")) ||
      (read && /^\/lines\/\d+\/report$/.test(path)) ||
      (read && /^\/maintenance-actions\/\d+\/revisions$/.test(path)) ||
      (/^\/maintenance-actions\/machines\/\d+(?:\/owners)?$/.test(path) &&
        (read || method === "POST")) ||
      (/^\/maintenance-actions\/\d+\/(revise|complete)$/.test(path) &&
        method === "POST"))
  )
    return;
  if (
    read &&
    (found = match(/^\/planning\/shifts\/(\d+)\/revisions\/\d+(?:\/verify)?$/))
  ) {
    await assertResource("shift", found[1]);
    return;
  }
  if (read && (found = match(/^\/maintenance\/machines\/(\d+)\/stops$/))) {
    assertMachine(found[1]);
    return;
  }
  if (
    (found = match(
      /^\/maintenance\/plans\/(\d+)\/events\/\d+\/attachments(\/\d+)?$/,
    ))
  ) {
    if (!read && (method !== "POST" || found[2] || !canOperate(scope.role)))
      denied();
    await assertResource("maintenance", found[1]);
    return;
  }
  if ((found = match(/^\/(maintenance|energy)\/machines\/(\d+)$/))) {
    if (!read && !canSupervise(scope.role)) denied();
    assertMachine(found[2]);
    return;
  }
  if (read && (found = match(/^\/energy\/shifts\/(\d+)$/))) {
    await assertResource("shift", found[1]);
    return;
  }
  if (
    method === "POST" &&
    (found = match(/^\/energy\/shifts\/(\d+)\/reconcile$/)) &&
    canSupervise(scope.role)
  ) {
    await assertResource("shift", found[1]);
    return;
  }
  if (
    method === "POST" &&
    (found = match(/^\/maintenance\/plans\/(\d+)\/events$/)) &&
    canOperate(scope.role)
  ) {
    await assertResource("maintenance", found[1]);
    return;
  }
  if (
    (found = match(
      /^\/planning\/machines\/(\d+)\/(calendars|plan|changeovers|changeover-standards)$/,
    ))
  ) {
    if (!read && !canSupervise(scope.role)) denied();
    assertMachine(found[1]);
    return;
  }
  if ((found = match(/^\/planning\/shifts\/(\d+)\/(runs|revisions)$/))) {
    if (!read && !canSupervise(scope.role)) denied();
    await assertResource("shift", found[1]);
    return;
  }
  if (read && (found = match(/^\/history\/(\d+)\/summaries$/))) {
    assertMachine(found[1]);
    return;
  }
  if (
    read &&
    [
      "/production/assets",
      "/production/shifts",
      "/production/operator/owners",
    ].includes(path)
  )
    return;
  if (read && path === "/production/operator/live") {
    const ids = String(query.ids ?? "").split(",");
    if (!ids.length || ids.length > 6) denied();
    ids.forEach((id) => assertMachine(id));
    return;
  }
  if (path === "/production/operator/entries") {
    if (!read && (method !== "POST" || !canOperate(scope.role))) denied();
    assertMachine(read ? query.machineId : body.machineId);
    return;
  }
  if (
    (found = match(/^\/production\/operator\/entries\/(\d+)(?:\/history)?$/))
  ) {
    if (!read && (method !== "POST" || !canOperate(scope.role))) denied();
    if (body.status === "reviewed" && !canSupervise(scope.role)) denied();
    await assertResource("entry", found[1]);
    return;
  }
  if ((found = match(/^\/production\/shifts\/(\d+)\/inspections$/))) {
    if (!read && (method !== "POST" || !canOperate(scope.role))) denied();
    await assertResource("shift", found[1]);
    return;
  }
  if ((found = match(/^\/production\/machines\/(\d+)\/inspection-plans$/))) {
    if (!read && (method !== "POST" || !canSupervise(scope.role))) denied();
    assertMachine(found[1]);
    return;
  }
  if (read && (found = match(/^\/production\/replay\/(\d+)$/))) {
    assertMachine(found[1]);
    return;
  }
  if (
    (found = match(
      /^\/production\/shifts\/(\d+)\/(report|evidence|reasons|reconcile)$/,
    ))
  ) {
    if (
      found[2] === "report" || found[2] === "evidence"
        ? !read
        : method !== "POST" ||
          !(found[2] === "reasons"
            ? canOperate(scope.role)
            : canSupervise(scope.role))
    )
      denied();
    await assertResource("shift", found[1]);
    return;
  }
  if (
    method === "POST" &&
    path === "/production/shifts" &&
    canSupervise(scope.role)
  ) {
    assertMachine(body.machineId);
    return;
  }
  if (
    read &&
    [
      "/node-data",
      "/aggregates",
      "/operation-mode-data",
      "/trending/data",
      "/trending/export-csv",
    ].includes(path)
  ) {
    assertMachine(query.machineId);
    return;
  }
  if (read && (found = match(/^\/trending\/available-tags\/(\d+)$/))) {
    assertMachine(found[1]);
    return;
  }
  if (
    read &&
    ["/alarms", "/alarms/rules", "/alerts/history", "/alerts/rules"].includes(
      path,
    )
  ) {
    if (query.machineId !== undefined) assertMachine(query.machineId);
    return;
  }
  if (
    method === "POST" &&
    (found = match(/^\/alarms\/(\d+)\/acknowledge$/)) &&
    canOperate(scope.role)
  ) {
    await assertResource("alarm", found[1]);
    return;
  }
  if (
    method === "PUT" &&
    (found = match(/^\/alerts\/history\/(\d+)\/acknowledge$/)) &&
    canOperate(scope.role)
  ) {
    await assertResource("alarm", found[1]);
    return;
  }
  if (
    read &&
    (found = match(
      /^\/oee\/(?:config\/)?(\d+)(?:\/history|\/manual-entries)?$/,
    ))
  ) {
    assertMachine(found[1]);
    return;
  }
  if (read && path === "/dashboards") return;
  if (read && (found = match(/^\/dashboards\/([^/]+)$/))) {
    assertDashboard(decodeURIComponent(found[1]));
    return;
  }
  if (read && path === "/annotations") {
    assertDashboard(query.dashboardId);
    return;
  }
  // Unscoped configuration, experimental modules and system diagnostics stay administrator-only.
  denied();
}
