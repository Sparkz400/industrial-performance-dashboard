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
import type { SignalMetadata } from "@performance-dashboard/shared";

// --- Enums ---

export const userRoleEnum = pgEnum("users_role_enum", ["admin", "viewer"]);
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
  url: varchar("url", { length: 2048 }).notNull(),
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
    token: varchar("token", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    allowEmbed: boolean("allow_embed").default(false).notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
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

// --- Feature: Compliance Audit Trail (21 CFR Part 11) ---

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
  },
  (table) => [
    index("idx_report_history_schedule").on(table.scheduleId),
    index("idx_report_history_generated").on(table.generatedAt),
  ],
);

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
