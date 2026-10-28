import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import db from "../database/db.js";
import {
  alertRules,
  alertHistory,
  auditLogs,
  configBundleImports,
  dashboardAssets,
  dashboards,
  machines,
  nodeMappings,
} from "../database/schema.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/errors.js";
import {
  bundleDigest,
  remapBundleWidgets,
  validateConfigurationBundle,
} from "./configBundleValidation.js";
import type { ConfigurationBundle } from "@performance-dashboard/shared";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const mappingFields = {
  nodeId: nodeMappings.nodeId,
  nodeKey: nodeMappings.nodeKey,
  displayName: nodeMappings.displayName,
  dataType: nodeMappings.dataType,
  samplingInterval: nodeMappings.samplingInterval,
};
const ruleFields = {
  name: alertRules.name,
  nodeKey: alertRules.nodeKey,
  condition: alertRules.condition,
  threshold: alertRules.threshold,
  thresholdHigh: alertRules.thresholdHigh,
  rateWindowSeconds: alertRules.rateWindowSeconds,
  severity: alertRules.severity,
  cooldownSeconds: alertRules.cooldownSeconds,
  debounceSeconds: alertRules.debounceSeconds,
  clearDebounceSeconds: alertRules.clearDebounceSeconds,
  hysteresis: alertRules.hysteresis,
};

async function state(tx: Tx, machineId: number) {
  const [machine] = await tx
    .select()
    .from(machines)
    .where(eq(machines.id, machineId));
  if (!machine) throw new NotFoundError("Machine");
  const mappings = await tx
    .select()
    .from(nodeMappings)
    .where(eq(nodeMappings.machineId, machineId))
    .orderBy(nodeMappings.id);
  const rules = await tx
    .select()
    .from(alertRules)
    .where(eq(alertRules.machineId, machineId))
    .orderBy(alertRules.id);
  const boards = await tx
    .select({ id: dashboards.id, name: dashboards.name })
    .from(dashboards)
    .orderBy(dashboards.id);
  return { machine, mappings, rules, boards };
}
async function preview(tx: Tx, machineId: number, bundle: ConfigurationBundle) {
  const current = await state(tx, machineId);
  const conflicts: string[] = [];
  if (current.machine.isActive !== false)
    conflicts.push("Pause the target machine before importing setup");
  for (const m of bundle.mappings)
    if (
      current.mappings.some(
        (x) => x.nodeId === m.nodeId || x.nodeKey === m.nodeKey,
      )
    )
      conflicts.push(`Mapping already exists: ${m.nodeKey}`);
  for (const r of bundle.rules)
    if (current.rules.some((x) => x.name === r.name))
      conflicts.push(`Rule already exists: ${r.name}`);
  for (const d of bundle.dashboards)
    if (current.boards.some((x) => x.name === d.name))
      conflicts.push(`Dashboard name already exists: ${d.name}`);
  return {
    fingerprint: bundleDigest({ current, bundle }),
    conflicts,
    counts: {
      mappings: bundle.mappings.length,
      rules: bundle.rules.length,
      dashboards: bundle.dashboards.length,
    },
  };
}

export const configBundleService = {
  async export(machineId: number, dashboardIds: string[]) {
    if (
      dashboardIds.length > 20 ||
      new Set(dashboardIds).size !== dashboardIds.length
    )
      throw new ValidationError("Choose up to 20 distinct dashboards");
    return db.transaction(async (tx) => {
      const { machine } = await state(tx, machineId);
      const mappings = await tx
        .select(mappingFields)
        .from(nodeMappings)
        .where(eq(nodeMappings.machineId, machineId))
        .orderBy(nodeMappings.id);
      const rules = await tx
        .select(ruleFields)
        .from(alertRules)
        .where(eq(alertRules.machineId, machineId))
        .orderBy(alertRules.id);
      const rows = dashboardIds.length
        ? await tx
            .select()
            .from(dashboards)
            .where(inArray(dashboards.id, dashboardIds))
        : [];
      if (rows.length !== dashboardIds.length)
        throw new NotFoundError("Selected dashboard");
      const bundle = validateConfigurationBundle({
        format: "performance-dashboard-setup",
        version: 1,
        source: {
          machineId,
          name: machine.name,
          exportedAt: new Date().toISOString(),
        },
        mappings,
        rules,
        dashboards: rows.map((d) => ({
          name: d.name,
          sourceRevision: bundleDigest({
            widgets: d.widgets,
            layout: d.layout,
          }),
          widgets: d.widgets,
          layout: d.layout,
        })),
      });
      return bundle;
    });
  },
  async preview(machineId: number, input: unknown) {
    const bundle = validateConfigurationBundle(input);
    return db.transaction((tx) => preview(tx, machineId, bundle));
  },
  async apply(
    machineId: number,
    input: unknown,
    fingerprint: string,
    userId: number,
  ) {
    const bundle = validateConfigurationBundle(input);
    return db.transaction(async (tx) => {
      // Serialize preview validation with every writer to these small configuration tables.
      await tx.execute(
        sql`LOCK TABLE machines, node_mappings, alert_rules, dashboards, dashboard_assets IN SHARE ROW EXCLUSIVE MODE`,
      );
      const checked = await preview(tx, machineId, bundle);
      if (checked.fingerprint !== fingerprint)
        throw new ConflictError("Setup changed since preview. Preview again.");
      if (checked.conflicts.length)
        throw new ConflictError(checked.conflicts.join("; "));
      const mappings = bundle.mappings.length
        ? await tx
            .insert(nodeMappings)
            .values(
              bundle.mappings.map((m) => ({
                ...m,
                machineId,
                isActive: false,
              })),
            )
            .returning()
        : [];
      const rules = bundle.rules.length
        ? await tx
            .insert(alertRules)
            .values(
              bundle.rules.map((r) => ({
                ...r,
                machineId,
                channels: [],
                isActive: false,
                createdBy: userId,
              })),
            )
            .returning()
        : [];
      const boards = [];
      for (const d of bundle.dashboards) {
        const [board] = await tx
          .insert(dashboards)
          .values({
            id: randomUUID(),
            name: d.name,
            widgets: remapBundleWidgets(d.widgets, machineId),
            layout: d.layout,
          })
          .returning();
        await tx
          .insert(dashboardAssets)
          .values({ dashboardId: board.id, machineId });
        boards.push(board);
      }
      const id = randomUUID();
      const snapshot = JSON.parse(JSON.stringify({ mappings, rules, boards }));
      await tx.insert(configBundleImports).values({
        id,
        machineId,
        digest: bundleDigest(bundle),
        snapshot,
        createdBy: userId,
      });
      await tx.insert(auditLogs).values({
        action: "configuration.imported",
        entityType: "machine",
        entityId: String(machineId),
        userId,
        message: "Imported paused setup; existing configuration retained",
        metadata: {
          receiptId: id,
          counts: checked.counts,
          bundleDigest: bundleDigest(bundle),
          source: bundle.source,
          dashboardRevisions: bundle.dashboards.map((d) => ({
            name: d.name,
            revision: d.sourceRevision,
          })),
        },
      });
      return { id, counts: checked.counts, paused: true };
    });
  },
  async list(machineId: number) {
    return db
      .select({
        id: configBundleImports.id,
        digest: configBundleImports.digest,
        createdAt: configBundleImports.createdAt,
        rolledBackAt: configBundleImports.rolledBackAt,
      })
      .from(configBundleImports)
      .where(eq(configBundleImports.machineId, machineId))
      .orderBy(desc(configBundleImports.createdAt))
      .limit(50);
  },
  async rollback(machineId: number, id: string, userId: number) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`LOCK TABLE machines, node_mappings, alert_rules, dashboards, dashboard_assets, config_bundle_imports, annotations, share_tokens, dashboard_versions, dashboard_history, alert_history, digital_twin_instances IN SHARE ROW EXCLUSIVE MODE`,
      );
      const [receipt] = await tx
        .select()
        .from(configBundleImports)
        .where(
          and(
            eq(configBundleImports.id, id),
            eq(configBundleImports.machineId, machineId),
          ),
        );
      if (!receipt) throw new NotFoundError("Setup receipt");
      if (receipt.rolledBackAt) return { rolledBack: true };
      const current = await state(tx, machineId);
      if (current.machine.isActive !== false)
        throw new ConflictError("Pause the machine before rollback");
      const saved = receipt.snapshot as {
        mappings: (typeof nodeMappings.$inferSelect)[];
        rules: (typeof alertRules.$inferSelect)[];
        boards: (typeof dashboards.$inferSelect)[];
      };
      const boards = saved.boards.length
        ? await tx
            .select()
            .from(dashboards)
            .where(
              inArray(
                dashboards.id,
                saved.boards.map((d) => d.id),
              ),
            )
            .orderBy(dashboards.id)
        : [];
      const selected = {
        mappings: current.mappings.filter((m) =>
          saved.mappings.some((s) => s.id === m.id),
        ),
        rules: current.rules.filter((r) =>
          saved.rules.some((s) => s.id === r.id),
        ),
        boards,
      };
      const normalized = (v: typeof selected) =>
        JSON.parse(
          JSON.stringify({
            ...v,
            boards: [...v.boards].sort((a, b) => a.id.localeCompare(b.id)),
          }),
        );
      if (
        bundleDigest(normalized(selected)) !== bundleDigest(normalized(saved))
      )
        throw new ConflictError(
          "Imported setup was edited. Automatic rollback would discard later changes.",
        );
      const grants = boards.length
        ? await tx
            .select()
            .from(dashboardAssets)
            .where(
              inArray(
                dashboardAssets.dashboardId,
                boards.map((d) => d.id),
              ),
            )
        : [];
      if (
        grants.length !== boards.length ||
        grants.some((g) => g.machineId !== machineId)
      )
        throw new ConflictError("Dashboard access changed after import");
      // Later notes, sharing and history are user work even when the setup rows
      // themselves are unchanged. The table locks prevent a check/delete race.
      if (boards.length) {
        const ids = sql.join(
          boards.map((board) => sql`${board.id}`),
          sql`, `,
        );
        const dependencies = await tx.execute(sql`SELECT EXISTS (
          SELECT 1 FROM annotations WHERE dashboard_id IN (${ids})
          UNION ALL SELECT 1 FROM share_tokens WHERE dashboard_id IN (${ids})
          UNION ALL SELECT 1 FROM dashboard_versions WHERE dashboard_id IN (${ids})
          UNION ALL SELECT 1 FROM dashboard_history WHERE dashboard_id IN (${ids})
        ) AS present`);
        if (dependencies.rows[0]?.present)
          throw new ConflictError(
            "Imported dashboards have later notes, sharing or history. Automatic rollback would discard user work.",
          );
      }
      if (saved.rules.length) {
        const history = await tx
          .select({ id: alertHistory.id })
          .from(alertHistory)
          .where(
            inArray(
              alertHistory.ruleId,
              saved.rules.map((rule) => rule.id),
            ),
          )
          .limit(1);
        if (history.length)
          throw new ConflictError(
            "Imported rules have recorded alarms. Automatic rollback would remove their rule identity.",
          );
      }
      if (saved.mappings.length) {
        const keys = sql.join(
          saved.mappings.map((mapping) => sql`${mapping.nodeKey}`),
          sql`, `,
        );
        const importedRules = saved.rules.length
          ? sql`AND id NOT IN (${sql.join(
              saved.rules.map((rule) => sql`${rule.id}`),
              sql`, `,
            )})`
          : sql``;
        const dependencies = await tx.execute(sql`SELECT EXISTS (
          SELECT 1 FROM alert_rules WHERE (machine_id=${machineId} OR machine_id IS NULL)
            AND node_key IN (${keys}) ${importedRules}
          UNION ALL SELECT 1 FROM digital_twin_instances i WHERE i.machine_id=${machineId} AND
            CASE WHEN jsonb_typeof(i.node_bindings)='array' THEN EXISTS (
              SELECT 1 FROM jsonb_array_elements(i.node_bindings) binding WHERE binding->>'nodeKey' IN (${keys})
            ) ELSE i.node_bindings IS NOT NULL AND i.node_bindings <> 'null'::jsonb END
        ) AS present`);
        if (dependencies.rows[0]?.present)
          throw new ConflictError(
            "Imported mappings are referenced by other rules or asset bindings. Automatic rollback would leave broken configuration.",
          );
      }
      if (saved.mappings.length)
        await tx.delete(nodeMappings).where(
          inArray(
            nodeMappings.id,
            saved.mappings.map((m) => m.id),
          ),
        );
      if (saved.rules.length)
        await tx.delete(alertRules).where(
          inArray(
            alertRules.id,
            saved.rules.map((r) => r.id),
          ),
        );
      if (boards.length)
        await tx.delete(dashboards).where(
          inArray(
            dashboards.id,
            boards.map((d) => d.id),
          ),
        );
      await tx
        .update(configBundleImports)
        .set({ rolledBackAt: new Date() })
        .where(eq(configBundleImports.id, id));
      await tx.insert(auditLogs).values({
        action: "configuration.rolled_back",
        entityType: "machine",
        entityId: String(machineId),
        userId,
        message: "Removed unchanged setup created by import",
        metadata: { receiptId: id },
      });
      return { rolledBack: true };
    });
  },
};
