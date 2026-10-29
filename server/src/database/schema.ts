import {
  pgTable,
  pgEnum,
  text,
  varchar,
  integer,
  serial,
  boolean,
  real,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  index,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const retentionPolicies = pgTable("retention_policies", {
  machineId: integer("machine_id").primaryKey(),
  days: integer("days").notNull(),
  version: integer("version").notNull().default(1),
});

export const workOrderImports = pgTable(
  "work_order_imports",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "restrict" }),
    shiftId: integer("shift_id")
      .notNull()
      .references(() => productionShifts.id, { onDelete: "restrict" }),
    payload: jsonb("payload").notNull(),
    digest: text("digest").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("work_order_source_external").on(t.source, t.externalId)],
);
export const retentionPreviews = pgTable("retention_previews", {
  id: text("id").primaryKey(),
  machineId: integer("machine_id").notNull(),
  policyVersion: integer("policy_version").notNull(),
  cutoff: timestamp("cutoff", { withTimezone: true }).notNull(),
  maxId: integer("max_id").notNull(),
  rows: integer("rows").notNull(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deleted: integer("deleted").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
});
export const historySummaries = pgTable(
  "history_summaries",
  {
    machineId: integer("machine_id").notNull(),
    nodeKey: text("node_key").notNull(),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    samples: integer("samples").notNull(),
    good: integer("good").notNull(),
    sum: doublePrecision("sum"),
    min: doublePrecision("min"),
    max: doublePrecision("max"),
    identity: text("identity").notNull().default("unknown"),
  },
  (table) => [
    primaryKey({ columns: [table.machineId, table.nodeKey, table.bucket] }),
  ],
);
// State seconds of removed state readings, per hour and production state (H06).
export const historyStateSeconds = pgTable(
  "history_state_seconds",
  {
    machineId: integer("machine_id").notNull(),
    nodeKey: text("node_key").notNull(),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    state: varchar("state", { length: 20 }).notNull(),
    seconds: doublePrecision("seconds").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.machineId, table.nodeKey, table.bucket, table.state],
    }),
  ],
);
// Counter increments of removed counter readings, per hour of the later reading (H06).
export const historyCounterIncrements = pgTable(
  "history_counter_increments",
  {
    machineId: integer("machine_id").notNull(),
    nodeKey: text("node_key").notNull(),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    increment: doublePrecision("increment").notNull(),
    pairs: integer("pairs").notNull(),
    unknownPairs: integer("unknown_pairs").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.machineId, table.nodeKey, table.bucket] }),
  ],
);
import type {
  SignalMetadata,
  ScheduledReportConfig,
} from "@performance-dashboard/shared";

// --- Enums ---

export const userRoleEnum = pgEnum("users_role_enum", [
  "admin",
  "viewer",
  "wallboard",
  "operator",
  "supervisor",
]);
export const recipeStatusEnum = pgEnum("recipe_status_enum", [
  "draft",
  "active",
  "archived",
]);
export const batchStatusEnum = pgEnum("batch_status_enum", [
  "planned",
  "running",
  "completed",
  "aborted",
]);

// --- Tables ---

export const dashboards = pgTable("dashboards", {
  id: text("id").primaryKey(),
  name: varchar("name").notNull(),
  widgets: jsonb("widgets").default([]),
  layout: jsonb("layout").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dashboardHistory = pgTable(
  "dashboard_history",
  {
    id: serial("id").primaryKey(),
    dashboardId: varchar("dashboard_id").notNull(),
    action: varchar("action").notNull(),
    timestamp: timestamp("timestamp").defaultNow(),
    userId: varchar("user_id"),
  },
  (table) => [
    index("idx_dashboard_history_dashboard_id").on(table.dashboardId),
    index("idx_dashboard_history_timestamp").on(table.timestamp),
  ],
);

export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  endpointUrl: varchar("endpoint_url").notNull().unique(),
  ip: varchar("ip").notNull(),
  port: integer("port").notNull().default(4840),
  resourcePath: varchar("resource_path").default(""),
  securityMode: varchar("security_mode").default("None"),
  securityPolicy: varchar("security_policy").default("None"),
  // Per-endpoint subscription limits; null uses the collector defaults.
  subscription: jsonb("subscription").$type<{
    publishingIntervalMs: number;
    queueSize: number;
    maxNotificationsPerPublish: number;
  }>(),
  isActive: boolean("is_active").default(true),
  status: varchar("status").default("disconnected"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const nodeMappings = pgTable(
  "node_mappings",
  {
    id: serial("id").primaryKey(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id").notNull(),
    nodeKey: varchar("node_key").notNull(),
    displayName: varchar("display_name").notNull(),
    dataType: varchar("data_type").default("Double"),
    samplingInterval: integer("sampling_interval").default(500),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("node_mappings_machine_id_node_id_unique").on(
      table.machineId,
      table.nodeId,
    ),
    index("idx_node_mappings_machine_active").on(
      table.machineId,
      table.isActive,
    ),
  ],
);

export const machineCredentials = pgTable("machine_credentials", {
  machineId: integer("machine_id")
    .primaryKey()
    .references(() => machines.id, { onDelete: "cascade" }),
  mode: varchar("mode", { length: 20 }).notNull(),
  username: varchar("username", { length: 255 }),
  certificateExpiresAt: timestamp("certificate_expires_at", {
    withTimezone: true,
  }),
  encryptedSecret: text("encrypted_secret").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const opcuaData = pgTable(
  "opcua_data",
  {
    id: serial("id").notNull(),
    nodeKey: varchar("node_key").notNull(),
    nodeLabel: varchar("node_label"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    value: doublePrecision("value"),
    rawValue: jsonb("raw_value").$type<number | string | boolean | null>(),
    statusCode: text("status_code"),
    reportedStatusCode: text("reported_status_code"),
    sourceClockState: text("source_clock_state").notNull().default("unknown"),
    correctionRevision: integer("correction_revision").notNull().default(0),
    dataType: text("data_type"),
    sourceTimestamp: timestamp("source_timestamp", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    signalMetadata: jsonb("signal_metadata").$type<SignalMetadata>(),
    eventId: text("event_id"),
    machineId: integer("machine_id").references(() => machines.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({
      name: "opcua_data_pkey",
      columns: [table.timestamp, table.id],
    }),
    unique("opcua_data_event_timestamp_unique").on(
      table.timestamp,
      table.eventId,
    ),
    index("idx_opcua_data_node_key_timestamp").on(
      table.nodeKey,
      table.timestamp,
    ),
    index("idx_opcua_data_machine_node_timestamp").on(
      table.machineId,
      table.nodeKey,
      table.timestamp,
    ),
  ],
);

// --- Annotations (persisted) ---

export const annotations = pgTable(
  "annotations",
  {
    id: text("id").primaryKey(),
    widgetId: varchar("widget_id").notNull(),
    dashboardId: varchar("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull(),
    color: varchar("color", { length: 20 }).notNull().default("#ff9800"),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_annotations_dashboard").on(table.dashboardId),
    index("idx_annotations_widget").on(table.widgetId),
  ],
);

export const opcuaDataDlq = pgTable("opcua_data_dlq", {
  id: serial("id").primaryKey(),
  errorMessage: text("error_message").notNull(),
  batchData: jsonb("batch_data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const session = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("idx_session_expire").on(table.expire)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }),
    entityName: varchar("entity_name", { length: 255 }),
    message: text("message").notNull(),
    metadata: jsonb("metadata").default({}),
    userId: integer("user_id"),
    username: varchar("username", { length: 100 }),
    userRole: userRoleEnum("user_role"),
    ipAddress: varchar("ip_address", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_audit_logs_created_at").on(table.createdAt),
    index("idx_audit_logs_entity").on(table.entityType, table.entityId),
    index("idx_audit_logs_user_created_at").on(table.userId, table.createdAt),
  ],
);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull().default("viewer"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// --- Webhooks ---

export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // "webhook" posts signed JSON to url; "email" sends alarm mail to recipients via SMTP_*.
  kind: varchar("kind", { length: 10 }).notNull().default("webhook"),
  url: varchar("url", { length: 2048 }),
  recipients: jsonb("recipients").$type<string[]>().default([]).notNull(),
  // Alarm routing: lowest severity delivered, and machines (empty means all).
  minSeverity: varchar("min_severity", { length: 20 }),
  machineIds: jsonb("machine_ids").$type<number[]>().default([]).notNull(),
  secret: varchar("secret", { length: 255 }).notNull(),
  events: jsonb("events").default([]).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastStatus: integer("last_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// --- Share Tokens ---

export const shareTokens = pgTable(
  "share_tokens",
  {
    id: serial("id").primaryKey(),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    // Legacy plaintext tokens stay unusable; current links store only token_hash.
    token: varchar("token", { length: 64 }).unique(),
    tokenHash: varchar("token_hash", { length: 64 }).unique(),
    label: text("label"),
    // Frozen at creation: later dashboard edits never widen what a link exposes.
    selection:
      jsonb("selection").$type<
        import("@performance-dashboard/shared").SharedWidgetSelection[]
      >(),
    windowHours: integer("window_hours"),
    allowedOrigins: jsonb("allowed_origins")
      .$type<string[]>()
      .default([])
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    allowEmbed: boolean("allow_embed").default(false).notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: integer("revoked_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("idx_share_tokens_token").on(table.token),
    index("idx_share_tokens_dashboard").on(table.dashboardId),
  ],
);

// --- Custom Widgets ---

export const customWidgets = pgTable("custom_widgets", {
  id: serial("id").primaryKey(),
  manifestUrl: varchar("manifest_url", { length: 2048 }).notNull().unique(),
  manifest: jsonb("manifest").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  installedBy: integer("installed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// --- Feature: Compliance Audit Trail (application records; no regulatory validation) ---

export const complianceAuditLogs = pgTable(
  "compliance_audit_logs",
  {
    id: serial("id").primaryKey(),
    action: varchar("action", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }),
    entityName: varchar("entity_name", { length: 255 }),
    message: text("message").notNull(),
    metadata: jsonb("metadata").default({}),
    userId: integer("user_id"),
    username: varchar("username", { length: 100 }),
    userRole: userRoleEnum("user_role"),
    ipAddress: varchar("ip_address", { length: 255 }),
    reasonForChange: text("reason_for_change"),
    electronicSignature: jsonb("electronic_signature"),
    snapshotBefore: jsonb("snapshot_before"),
    snapshotAfter: jsonb("snapshot_after"),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    // 1: legacy fields only; 2: canonical JSON of every recorded field.
    checksumVersion: integer("checksum_version").notNull().default(1),
    previousChecksum: varchar("previous_checksum", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_compliance_audit_created_at").on(table.createdAt),
    index("idx_compliance_audit_entity").on(table.entityType, table.entityId),
    index("idx_compliance_audit_user").on(table.userId, table.createdAt),
    index("idx_compliance_audit_checksum").on(table.checksum),
  ],
);

export const dashboardVersions = pgTable(
  "dashboard_versions",
  {
    id: serial("id").primaryKey(),
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    name: varchar("name").notNull(),
    widgets: jsonb("widgets").default([]),
    layout: jsonb("layout").default([]),
    changeDescription: text("change_description"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_dashboard_versions_dashboard").on(table.dashboardId),
    unique("dashboard_versions_dashboard_version").on(
      table.dashboardId,
      table.version,
    ),
  ],
);

// --- Feature: Predictive Maintenance (SPC) ---

export const spcProfiles = pgTable(
  "spc_profiles",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    machineId: integer("machine_id").references(() => machines.id, {
      onDelete: "cascade",
    }),
    nodeKey: varchar("node_key", { length: 255 }).notNull(),
    method: varchar("method", { length: 50 }).notNull(),
    windowSize: integer("window_size").notNull().default(100),
    ucl: real("ucl"),
    lcl: real("lcl"),
    mean: real("mean"),
    stddev: real("stddev"),
    sensitivity: real("sensitivity").default(3.0),
    // Declared data assumption: "individuals" (I-MR) or "xbar-r" with subgroupSize 2–10.
    chartType: varchar("chart_type", { length: 20 }),
    subgroupSize: integer("subgroup_size"),
    isActive: boolean("is_active").default(true),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_spc_profiles_machine_node").on(table.machineId, table.nodeKey),
  ],
);

export const spcAlerts = pgTable(
  "spc_alerts",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => spcProfiles.id, { onDelete: "cascade" }),
    machineId: integer("machine_id").references(() => machines.id, {
      onDelete: "set null",
    }),
    nodeKey: varchar("node_key", { length: 255 }).notNull(),
    alertType: varchar("alert_type", { length: 50 }).notNull(),
    value: real("value").notNull(),
    threshold: real("threshold").notNull(),
    message: text("message").notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("medium"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: integer("acknowledged_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_spc_alerts_profile").on(table.profileId),
    index("idx_spc_alerts_created_at").on(table.createdAt),
    index("idx_spc_alerts_unacknowledged").on(table.acknowledgedAt),
  ],
);

// --- Feature: Recipe / Batch Management ---

export const recipes = pgTable(
  "recipes",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    version: integer("version").notNull().default(1),
    description: text("description"),
    machineId: integer("machine_id").references(() => machines.id, {
      onDelete: "set null",
    }),
    status: recipeStatusEnum("status").notNull().default("draft"),
    parameters: jsonb("parameters").notNull().default([]),
    setpoints: jsonb("setpoints").default({}),
    parentId: integer("parent_id"),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_recipes_machine").on(table.machineId),
    index("idx_recipes_status").on(table.status),
    unique("recipes_name_version").on(table.name, table.version),
  ],
);

export const batches = pgTable(
  "batches",
  {
    id: serial("id").primaryKey(),
    batchNumber: varchar("batch_number", { length: 100 }).notNull().unique(),
    recipeId: integer("recipe_id").references(() => recipes.id, {
      onDelete: "set null",
    }),
    recipeSnapshot: jsonb("recipe_snapshot").$type<{
      id: number;
      name: string;
      version: number;
      parameters: unknown;
      setpoints: unknown;
    }>(),
    machineId: integer("machine_id").references(() => machines.id, {
      onDelete: "set null",
    }),
    status: batchStatusEnum("status").notNull().default("planned"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    metadata: jsonb("metadata").default({}),
    summary: jsonb("summary"),
    startedBy: integer("started_by").references(() => users.id, {
      onDelete: "set null",
    }),
    completedBy: integer("completed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_batches_recipe").on(table.recipeId),
    index("idx_batches_machine").on(table.machineId),
    index("idx_batches_status").on(table.status),
    index("idx_batches_started_at").on(table.startedAt),
  ],
);

// --- Feature: Digital Twin ---

export const digitalTwinTemplates = pgTable("digital_twin_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  svgContent: text("svg_content").notNull(),
  elementMappings: jsonb("element_mappings").default([]),
  thumbnail: text("thumbnail"),
  category: varchar("category", { length: 100 }).default("general"),
  createdBy: integer("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const digitalTwinInstances = pgTable(
  "digital_twin_instances",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id")
      .notNull()
      .references(() => digitalTwinTemplates.id, { onDelete: "cascade" }),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    nodeBindings: jsonb("node_bindings").default([]),
    displayConfig: jsonb("display_config").default({}),
    isActive: boolean("is_active").default(true),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_digital_twin_instances_machine").on(table.machineId)],
);

// --- Feature: Edge Gateway ---

export const edgeSyncQueue = pgTable(
  "edge_sync_queue",
  {
    id: serial("id").primaryKey(),
    tableName: varchar("table_name", { length: 100 }).notNull(),
    operation: varchar("operation", { length: 10 }).notNull(),
    recordId: varchar("record_id", { length: 255 }).notNull(),
    payload: jsonb("payload").notNull(),
    syncStatus: varchar("sync_status", { length: 20 })
      .notNull()
      .default("pending"),
    retryCount: integer("retry_count").default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_edge_sync_queue_status").on(table.syncStatus),
    index("idx_edge_sync_queue_created").on(table.createdAt),
  ],
);

export const edgeConfig = pgTable("edge_config", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ===== Feature 1: Multi-plant / Multi-tenant =====

export const plants = pgTable("plants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  location: varchar("location", { length: 255 }),
  timezone: varchar("timezone", { length: 50 }).notNull().default("UTC"),
  config: jsonb("config").default({}),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const machineSites = pgTable("machine_sites", {
  machineId: integer("machine_id")
    .primaryKey()
    .references(() => machines.id, { onDelete: "cascade" }),
  plantId: integer("plant_id")
    .notNull()
    .references(() => plants.id, { onDelete: "cascade" }),
});

export const machineGrants = pgTable(
  "machine_grants",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.machineId] })],
);

export const dashboardAssets = pgTable(
  "dashboard_assets",
  {
    dashboardId: text("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.dashboardId, table.machineId] })],
);

export const plantMemberships = pgTable(
  "plant_memberships",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    plantId: integer("plant_id")
      .notNull()
      .references(() => plants.id, { onDelete: "cascade" }),
    role: userRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("plant_memberships_user_plant_unique").on(
      table.userId,
      table.plantId,
    ),
    index("idx_plant_memberships_user").on(table.userId),
    index("idx_plant_memberships_plant").on(table.plantId),
  ],
);

// ===== Feature 2: OEE =====

export const oeeConfig = pgTable("oee_config", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "cascade" })
    .unique(),
  runningModeValues: jsonb("running_mode_values").notNull().default([]),
  idleModeValues: jsonb("idle_mode_values").default([]),
  plannedStopModeValues: jsonb("planned_stop_mode_values").default([]),
  unplannedStopModeValues: jsonb("unplanned_stop_mode_values").default([]),
  idealCycleTimeMs: real("ideal_cycle_time_ms"),
  productionCountNodeKey: varchar("production_count_node_key"),
  goodCountNodeKey: varchar("good_count_node_key"),
  rejectCountNodeKey: varchar("reject_count_node_key"),
  manualEntryEnabled: boolean("manual_entry_enabled").default(false),
  plannedProductionHoursPerDay: real(
    "planned_production_hours_per_day",
  ).default(24),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const oeeManualEntries = pgTable(
  "oee_manual_entries",
  {
    id: serial("id").primaryKey(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    productionCount: integer("production_count"),
    goodCount: integer("good_count"),
    rejectCount: integer("reject_count"),
    plannedDowntimeMinutes: integer("planned_downtime_minutes").default(0),
    notes: text("notes"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("oee_manual_entries_machine_date_unique").on(
      table.machineId,
      table.date,
    ),
  ],
);

// ===== Feature 3: Alerting & Notification Engine =====

export const alertSeverityEnum = pgEnum("alert_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "active",
  "acknowledged",
  "resolved",
  "silenced",
]);

export const alertRules = pgTable(
  "alert_rules",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    machineId: integer("machine_id").references(() => machines.id, {
      onDelete: "cascade",
    }),
    plantId: integer("plant_id").references(() => plants.id, {
      onDelete: "set null",
    }),
    nodeKey: varchar("node_key").notNull(),
    condition: varchar("condition", { length: 50 }).notNull(),
    threshold: real("threshold"),
    thresholdHigh: real("threshold_high"),
    rateWindowSeconds: integer("rate_window_seconds"),
    severity: alertSeverityEnum("severity").notNull().default("medium"),
    channels: jsonb("channels").notNull().default([]),
    cooldownSeconds: integer("cooldown_seconds").default(300),
    debounceSeconds: integer("debounce_seconds").notNull().default(0),
    clearDebounceSeconds: integer("clear_debounce_seconds")
      .notNull()
      .default(0),
    hysteresis: real("hysteresis").notNull().default(0),
    isActive: boolean("is_active").default(true),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_alert_rules_machine_node").on(
      table.machineId,
      table.nodeKey,
      table.isActive,
    ),
  ],
);

// Written by a database trigger on every rule insert/update, whatever the write path.
export const alertRuleVersions = pgTable(
  "alert_rule_versions",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    rule: jsonb("rule").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("idx_alert_rule_versions_rule").on(table.ruleId, table.effectiveAt),
  ],
);

export const alertHistory = pgTable(
  "alert_history",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id").references(() => alertRules.id, {
      onDelete: "set null",
    }),
    ruleName: varchar("rule_name", { length: 255 }),
    machineId: integer("machine_id"),
    nodeKey: varchar("node_key"),
    triggerValue: real("trigger_value"),
    threshold: real("threshold"),
    severity: alertSeverityEnum("severity"),
    status: alertStatusEnum("status").default("active"),
    message: text("message"),
    acknowledgedBy: integer("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_alert_history_created_at").on(table.createdAt),
    index("idx_alert_history_rule").on(table.ruleId),
    index("idx_alert_history_status").on(table.status),
    index("idx_alert_history_health").on(
      sql`(${table.metadata}->>'healthKey')`,
      table.resolvedAt,
    ),
  ],
);

export const notificationChannels = pgTable("notification_channels", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  config: jsonb("config").notNull(),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// One durable cursor per rule and observed machine; replay never reopens old incidents.
export const alarmEvaluationState = pgTable("alarm_evaluation_state", {
  key: varchar("key").primaryKey(),
  ruleId: integer("rule_id")
    .notNull()
    .references(() => alertRules.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull(),
});

export const alarmEvaluationReceipts = pgTable("alarm_evaluation_receipts", {
  key: varchar("key").primaryKey(),
  ruleId: integer("rule_id")
    .notNull()
    .references(() => alertRules.id, { onDelete: "cascade" }),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id")
    .notNull()
    .references(() => webhooks.id, { onDelete: "cascade" }),
  event: jsonb("event").notNull(),
  // Version of the payload shape when queued; bump the default when the shape changes.
  schemaVersion: integer("schema_version").notNull().default(1),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
  lastStatus: integer("last_status"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const machineProfiles = pgTable("machine_profiles", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "restrict" }),
  profile: jsonb("profile").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productionShifts = pgTable("production_shifts", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 160 }).notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull(),
  start: timestamp("start", { withTimezone: true }).notNull(),
  end: timestamp("end", { withTimezone: true }).notNull(),
  profile: jsonb("profile").notNull(),
  job: jsonb("job").notNull(),
  runs: jsonb("runs")
    .$type<import("@performance-dashboard/shared").ProductRun[]>()
    .notNull()
    .default([]),
  planVersion: integer("plan_version").notNull().default(1),
  calendarKey: text("calendar_key").unique(),
  breaks: jsonb("breaks").notNull().default([]),
  evidence: jsonb("evidence"),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Expected changeover per product transition; append-only, the latest row is in force. */
export const changeoverStandards = pgTable(
  "changeover_standards",
  {
    id: serial("id").primaryKey(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "restrict" }),
    fromProduct: varchar("from_product", { length: 160 }).notNull(),
    toProduct: varchar("to_product", { length: 160 }).notNull(),
    expectedSeconds: integer("expected_seconds").notNull(),
    note: text("note"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("changeover_standard_pair").on(
      t.machineId,
      t.fromProduct,
      t.toProduct,
    ),
    check(
      "changeover_expected_seconds",
      sql`${t.expectedSeconds} > 0 AND ${t.expectedSeconds} <= 86400`,
    ),
    check(
      "changeover_distinct_products",
      sql`${t.fromProduct} <> ${t.toProduct}`,
    ),
  ],
);

export const productionCalendars = pgTable("production_calendars", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "restrict" }),
  config: jsonb("config").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
});
export const shiftReportRevisions = pgTable("shift_report_revisions", {
  id: serial("id").primaryKey(),
  shiftId: integer("shift_id")
    .notNull()
    .references(() => productionShifts.id, { onDelete: "restrict" }),
  snapshot: jsonb("snapshot").notNull(),
  digest: text("digest").notNull(),
  // Required for every revision after the first; legacy rows stay null.
  reason: text("reason"),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const maintenancePlans = pgTable("maintenance_plans", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "restrict" }),
  config: jsonb("config").notNull(),
  profile: jsonb("profile").notNull(),
  version: integer("version").notNull().default(1),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const maintenanceEvents = pgTable("maintenance_events", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  planId: integer("plan_id")
    .notNull()
    .references(() => maintenancePlans.id, { onDelete: "restrict" }),
  serviced: boolean("serviced").notNull(),
  checks: jsonb("checks").notNull(),
  note: text("note").notNull(),
  incidentId: integer("incident_id").references(() => operatorEntries.id, {
    onDelete: "restrict",
  }),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const energyMeters = pgTable("energy_meters", {
  machineId: integer("machine_id")
    .primaryKey()
    .references(() => machines.id, { onDelete: "restrict" }),
  config: jsonb("config").notNull(),
  version: integer("version").notNull().default(1),
});
export const energyReconciliations = pgTable("energy_reconciliations", {
  shiftId: integer("shift_id")
    .primaryKey()
    .references(() => productionShifts.id, { onDelete: "restrict" }),
  kWh: doublePrecision("kwh").notNull(),
  toleranceKWh: doublePrecision("tolerance_kwh").notNull(),
  reference: text("reference").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const operatorEntries = pgTable(
  "operator_entries",
  {
    id: serial("id").primaryKey(),
    requestId: varchar("request_id", { length: 36 }).notNull().unique(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    shiftId: integer("shift_id").references(() => productionShifts.id, {
      onDelete: "set null",
    }),
    kind: varchar("kind", { length: 20 }).notNull(),
    text: text("text").notNull(),
    priority: varchar("priority", { length: 10 }).notNull().default("normal"),
    status: varchar("status", { length: 10 }).notNull().default("open"),
    ownerId: integer("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    intervalStart: timestamp("interval_start", { withTimezone: true }),
    intervalEnd: timestamp("interval_end", { withTimezone: true }),
    quantity: jsonb("quantity").$type<{
      total: number;
      good: number;
      reject: number;
    }>(),
    manualState: varchar("manual_state", { length: 10 }).$type<
      "running" | "idle" | "fault" | "planned"
    >(),
    version: integer("version").notNull().default(1),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_operator_entries_machine_status").on(
      table.machineId,
      table.status,
      table.updatedAt,
    ),
    check(
      "operator_manual_state",
      sql`(${table.kind}='state' AND ${table.manualState} IN ('running','idle','fault','planned'))
        OR (${table.kind}<>'state' AND ${table.manualState} IS NULL)`,
    ),
  ],
);

export const operatorEntryEvents = pgTable(
  "operator_entry_events",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => operatorEntries.id, { onDelete: "cascade" }),
    actorId: integer("actor_id")
      .notNull()
      .references(() => users.id),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("operator_entry_version_unique").on(table.entryId, table.version),
  ],
);

export const downtimeReasons = pgTable("downtime_reasons", {
  id: serial("id").primaryKey(),
  shiftId: integer("shift_id")
    .notNull()
    .references(() => productionShifts.id, { onDelete: "restrict" }),
  start: timestamp("start", { withTimezone: true }).notNull(),
  end: timestamp("end", { withTimezone: true }).notNull(),
  category: varchar("category", { length: 20 }).notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  supersedesId: integer("supersedes_id").unique(),
  actorId: integer("actor_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ===== Feature 5: Scheduled Reports =====

export const reportTemplates = pgTable("report_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  description: text("description"),
  templateConfig: jsonb("template_config").notNull(),
  plantId: integer("plant_id").references(() => plants.id, {
    onDelete: "cascade",
  }),
  isActive: boolean("is_active").default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const reportSchedules = pgTable("report_schedules", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .notNull()
    .references(() => reportTemplates.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  cronExpression: varchar("cron_expression", { length: 100 }).notNull(),
  timezone: varchar("timezone", { length: 50 }).default("UTC"),
  machineIds: jsonb("machine_ids").default([]),
  recipients: jsonb("recipients").default([]),
  deliveryChannels: jsonb("delivery_channels").default(["email"]),
  isActive: boolean("is_active").default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunStatus: varchar("last_run_status", { length: 50 }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const reportHistory = pgTable(
  "report_history",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id").references(() => reportSchedules.id, {
      onDelete: "set null",
    }),
    templateId: integer("template_id").references(() => reportTemplates.id, {
      onDelete: "set null",
    }),
    scheduleName: varchar("schedule_name", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull(),
    filePath: varchar("file_path", { length: 1024 }),
    fileSize: integer("file_size"),
    error: text("error"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").default({}),
    runKey: text("run_key").unique(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    snapshot: jsonb("snapshot").$type<ReportSnapshot>(),
    attempts: integer("attempts").notNull().default(0),
    retryAt: timestamp("retry_at", { withTimezone: true }),
    emailStatus: varchar("email_status", { length: 30 })
      .notNull()
      .default("not-requested"),
    emailAttempts: integer("email_attempts").notNull().default(0),
    emailRetryAt: timestamp("email_retry_at", { withTimezone: true }),
    emailError: text("email_error"),
    emailRemaining: jsonb("email_remaining").$type<string[]>(),
  },
  (table) => [
    index("idx_report_history_schedule").on(table.scheduleId),
    index("idx_report_history_generated").on(table.generatedAt),
    index("idx_report_history_retry").on(table.retryAt, table.emailRetryAt),
  ],
);

export interface ReportSnapshot {
  name: string;
  title: string;
  config: ScheduledReportConfig;
  timezone: string;
  machineIds: number[];
  recipients: string[];
  email: boolean;
}

// --- Type exports ---

export type Dashboard = typeof dashboards.$inferSelect;
export type NewDashboard = typeof dashboards.$inferInsert;
export type DashboardHistoryEntry = typeof dashboardHistory.$inferSelect;
export type Machine = typeof machines.$inferSelect;
export type NewMachine = typeof machines.$inferInsert;
export type NodeMapping = typeof nodeMappings.$inferSelect;
export type NewNodeMapping = typeof nodeMappings.$inferInsert;
export type OpcuaDataRow = typeof opcuaData.$inferSelect;
export type OpcuaDataDlqRow = typeof opcuaDataDlq.$inferSelect;
export type AnnotationRow = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type WebhookRow = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type ShareTokenRow = typeof shareTokens.$inferSelect;
export type NewShareToken = typeof shareTokens.$inferInsert;
export type CustomWidgetRow = typeof customWidgets.$inferSelect;
export type NewCustomWidget = typeof customWidgets.$inferInsert;

// Compliance
export type ComplianceAuditLog = typeof complianceAuditLogs.$inferSelect;
export type NewComplianceAuditLog = typeof complianceAuditLogs.$inferInsert;
export type DashboardVersion = typeof dashboardVersions.$inferSelect;
export type NewDashboardVersion = typeof dashboardVersions.$inferInsert;

// SPC
export type SpcProfile = typeof spcProfiles.$inferSelect;
export type NewSpcProfile = typeof spcProfiles.$inferInsert;
export type SpcAlert = typeof spcAlerts.$inferSelect;
export type NewSpcAlert = typeof spcAlerts.$inferInsert;

// Recipe / Batch
export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;

// Digital Twin
export type DigitalTwinTemplate = typeof digitalTwinTemplates.$inferSelect;
export type NewDigitalTwinTemplate = typeof digitalTwinTemplates.$inferInsert;
export type DigitalTwinInstance = typeof digitalTwinInstances.$inferSelect;
export type NewDigitalTwinInstance = typeof digitalTwinInstances.$inferInsert;

// Edge Gateway
export type EdgeSyncQueueRow = typeof edgeSyncQueue.$inferSelect;
export type NewEdgeSyncQueueRow = typeof edgeSyncQueue.$inferInsert;
export type EdgeConfigRow = typeof edgeConfig.$inferSelect;
export type NewEdgeConfigRow = typeof edgeConfig.$inferInsert;

// Multi-plant
export type PlantRow = typeof plants.$inferSelect;
export type NewPlant = typeof plants.$inferInsert;
export type PlantMembershipRow = typeof plantMemberships.$inferSelect;
export type NewPlantMembership = typeof plantMemberships.$inferInsert;

// OEE
export type OeeConfigRow = typeof oeeConfig.$inferSelect;
export type NewOeeConfig = typeof oeeConfig.$inferInsert;
export type OeeManualEntryRow = typeof oeeManualEntries.$inferSelect;
export type NewOeeManualEntry = typeof oeeManualEntries.$inferInsert;

// Alerting
export type AlertRuleRow = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
export type AlertHistoryRow = typeof alertHistory.$inferSelect;
export type NewAlertHistory = typeof alertHistory.$inferInsert;
export type NotificationChannelRow = typeof notificationChannels.$inferSelect;
export type NewNotificationChannel = typeof notificationChannels.$inferInsert;

// Reports
export type ReportTemplateRow = typeof reportTemplates.$inferSelect;
export type NewReportTemplate = typeof reportTemplates.$inferInsert;
export type ReportScheduleRow = typeof reportSchedules.$inferSelect;
export type NewReportSchedule = typeof reportSchedules.$inferInsert;
export type ReportHistoryRow = typeof reportHistory.$inferSelect;
export type NewReportHistory = typeof reportHistory.$inferInsert;

// Quality and operations evidence. Request-facing mutations are validated by their routes.
export const qualityInspections = pgTable(
  "quality_inspections",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batches.id),
    requestId: text("request_id").notNull().unique(),
    checkName: text("check_name").notNull(),
    result: text("result").notNull(),
    quantity: integer("quantity").notNull(),
    defectReason: text("defect_reason"),
    note: text("note").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("quality_inspections_batch").on(t.batchId),
    check("quality_result", sql`${t.result} IN ('pass','fail','unknown')`),
    check("quality_quantity", sql`${t.quantity}>0`),
    check(
      "quality_defect",
      sql`${t.result}<>'fail' OR coalesce(length(trim(${t.defectReason})),0)>0`,
    ),
  ],
);
export const batchRework = pgTable("batch_rework", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => batches.id),
  inspectionId: integer("inspection_id")
    .notNull()
    .unique()
    .references(() => qualityInspections.id),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => users.id),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  action: text("action").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedBy: integer("completed_by").references(() => users.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completionNote: text("completion_note"),
  verificationId: integer("verification_id").references(
    () => qualityInspections.id,
  ),
});
export const batchLots = pgTable(
  "batch_lots",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batches.id),
    lot: text("lot").notNull(),
    direction: text("direction").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    unit: text("unit").notNull(),
    supplierReference: text("supplier_reference"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.batchId, t.lot),
    index("lot_trace").on(t.lot),
    uniqueIndex("lot_producer")
      .on(t.lot)
      .where(sql`${t.direction}='output'`),
    check("lot_direction", sql`${t.direction} IN ('input','output')`),
    check("lot_quantity", sql`${t.quantity}>0`),
  ],
);
/** Checks required for a product on a machine; append-only, the latest plan applies. */
export const inspectionPlans = pgTable(
  "inspection_plans",
  {
    id: serial("id").primaryKey(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "restrict" }),
    product: varchar("product", { length: 160 }).notNull(),
    checks: jsonb("checks").$type<string[]>().notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("inspection_plan_product").on(t.machineId, t.product, t.id)],
);
/**
 * Manual inspections of a shift's product or job outside batches. A correction supersedes
 * one record; a reinspection after rework points at the failed inspection it re-checks.
 */
export const jobInspections = pgTable(
  "job_inspections",
  {
    id: serial("id").primaryKey(),
    requestId: varchar("request_id", { length: 36 }).notNull().unique(),
    shiftId: integer("shift_id")
      .notNull()
      .references(() => productionShifts.id, { onDelete: "restrict" }),
    product: varchar("product", { length: 160 }).notNull(),
    planId: integer("plan_id").references(() => inspectionPlans.id),
    checkName: varchar("check_name", { length: 200 }).notNull(),
    result: varchar("result", { length: 10 }).notNull(),
    quantity: integer("quantity").notNull(),
    defectReason: text("defect_reason"),
    note: text("note").notNull().default(""),
    reinspectsId: integer("reinspects_id").references(
      (): AnyPgColumn => jobInspections.id,
    ),
    supersedesId: integer("supersedes_id")
      .unique()
      .references((): AnyPgColumn => jobInspections.id),
    correctionReason: text("correction_reason"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("job_inspection_shift").on(t.shiftId, t.id),
    check(
      "job_inspection_result",
      sql`${t.result} IN ('pass','fail','unknown')`,
    ),
    check("job_inspection_quantity", sql`${t.quantity}>0`),
    check(
      "job_inspection_defect",
      sql`(${t.result}='fail') = (${t.defectReason} IS NOT NULL)`,
    ),
    check(
      "job_inspection_correction",
      sql`(${t.supersedesId} IS NULL) = (${t.correctionReason} IS NULL)`,
    ),
  ],
);
/** Append-only corrections of a declared lot link; the latest one applies, null quantity voids it. */
export const batchLotCorrections = pgTable(
  "batch_lot_corrections",
  {
    id: serial("id").primaryKey(),
    lotLinkId: integer("lot_link_id")
      .notNull()
      .references(() => batchLots.id),
    quantity: doublePrecision("quantity"),
    reason: text("reason").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lot_correction_link").on(t.lotLinkId, t.id),
    check(
      "lot_correction_quantity",
      sql`${t.quantity} IS NULL OR ${t.quantity}>0`,
    ),
  ],
);
export const spcBaselines = pgTable("spc_baselines", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id")
    .notNull()
    .references(() => spcProfiles.id),
  evidence: jsonb("evidence").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  review: text("review"),
  superseded: boolean("superseded").notNull().default(false),
});
export const productionLines = pgTable("production_lines", {
  id: serial("id").primaryKey(),
  config: jsonb("config").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const maintenanceActions = pgTable(
  "maintenance_actions",
  {
    id: serial("id").primaryKey(),
    version: integer("version").notNull().default(1),
    revisions: jsonb("revisions").notNull().default([]),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id),
    alarmId: integer("alarm_id")
      .notNull()
      .unique()
      .references(() => alertHistory.id),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id),
    escalationOwnerId: integer("escalation_owner_id")
      .notNull()
      .references(() => users.id),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    action: text("action").notNull(),
    suppressionUntil: timestamp("suppression_until", { withTimezone: true }),
    quietStart: integer("quiet_start"),
    quietEnd: integer("quiet_end"),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: integer("completed_by").references(() => users.id),
    serviceEventId: integer("service_event_id").references(
      () => maintenanceEvents.id,
    ),
    completionNote: text("completion_note"),
  },
  (t) => [
    index("maintenance_action_due")
      .on(t.dueAt)
      .where(sql`${t.completedAt} IS NULL`),
  ],
);
export const storageObservations = pgTable(
  "storage_observations",
  {
    kind: text("kind").notNull(),
    path: text("path").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    freeBytes: bigint("free_bytes", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.path, t.observedAt] })],
);
export const retentionSchedules = pgTable("retention_schedules", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(),
  previewId: text("preview_id")
    .notNull()
    .unique()
    .references(() => retentionPreviews.id),
  confirmRows: integer("confirm_rows").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  runAt: timestamp("run_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("scheduled"),
  error: text("error"),
});
export const retentionPreviewRows = pgTable(
  "retention_preview_rows",
  {
    previewId: text("preview_id")
      .notNull()
      .references(() => retentionPreviews.id, { onDelete: "cascade" }),
    measurementId: integer("measurement_id").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.previewId, t.timestamp, t.measurementId] })],
);

export const configBundleImports = pgTable("config_bundle_imports", {
  id: text("id").primaryKey(),
  machineId: integer("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "restrict" }),
  digest: text("digest").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdBy: integer("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
});

export const measurementCorrections = pgTable(
  "measurement_corrections",
  {
    id: text("id").primaryKey(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "restrict" }),
    measurementId: integer("measurement_id").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    revision: integer("revision").notNull(),
    before: jsonb("before").notNull(),
    after: jsonb("after").notNull(),
    reason: text("reason").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.measuredAt, t.measurementId, t.revision)],
);

export const derivedSignalDefinitions = pgTable(
  "derived_signal_definitions",
  {
    id: serial("id").primaryKey(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    expression: jsonb("expression").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.machineId, t.name, t.version)],
);

export const cmmsHandoffs = pgTable(
  "cmms_handoffs",
  {
    id: text("id").primaryKey(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "restrict" }),
    actionId: integer("action_id")
      .notNull()
      .references(() => maintenanceActions.id, { onDelete: "restrict" }),
    actionVersion: integer("action_version").notNull(),
    webhookId: integer("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "restrict" }),
    deliveryId: integer("delivery_id")
      .notNull()
      .unique()
      .references(() => webhookDeliveries.id, { onDelete: "restrict" }),
    destinationDigest: text("destination_digest").notNull(),
    payload: jsonb("payload").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.actionId, t.webhookId)],
);

export const energyTariffs = pgTable(
  "energy_tariffs",
  {
    id: serial("id").primaryKey(),
    machineId: integer("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }).notNull(),
    currency: text("currency").notNull(),
    pricePerKwh: doublePrecision("price_per_kwh").notNull(),
    kgCo2ePerKwh: doublePrecision("kg_co2e_per_kwh"),
    reference: text("reference").notNull(),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.machineId, t.version)],
);
