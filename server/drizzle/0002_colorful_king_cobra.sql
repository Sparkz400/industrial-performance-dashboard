CREATE TYPE "public"."alert_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'acknowledged', 'resolved', 'silenced');--> statement-breakpoint
CREATE TYPE "public"."batch_status_enum" AS ENUM('planned', 'running', 'completed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."recipe_status_enum" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer,
	"rule_name" varchar(255),
	"machine_id" integer,
	"node_key" varchar,
	"trigger_value" real,
	"threshold" real,
	"severity" "alert_severity",
	"status" "alert_status" DEFAULT 'active',
	"message" text,
	"acknowledged_by" integer,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"machine_id" integer,
	"plant_id" integer,
	"node_key" varchar NOT NULL,
	"condition" varchar(50) NOT NULL,
	"threshold" real,
	"threshold_high" real,
	"rate_window_seconds" integer,
	"severity" "alert_severity" DEFAULT 'medium' NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cooldown_seconds" integer DEFAULT 300,
	"is_active" boolean DEFAULT true,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" text PRIMARY KEY NOT NULL,
	"widget_id" varchar NOT NULL,
	"dashboard_id" varchar NOT NULL,
	"user_id" integer,
	"text" text NOT NULL,
	"color" varchar(20) DEFAULT '#ff9800' NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_number" varchar(100) NOT NULL,
	"recipe_id" integer,
	"machine_id" integer,
	"status" "batch_status_enum" DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"summary" jsonb,
	"started_by" integer,
	"completed_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "batches_batch_number_unique" UNIQUE("batch_number")
);
--> statement-breakpoint
CREATE TABLE "compliance_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(255),
	"entity_name" varchar(255),
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"user_id" integer,
	"username" varchar(100),
	"user_role" "users_role_enum",
	"ip_address" varchar(255),
	"reason_for_change" text,
	"electronic_signature" jsonb,
	"snapshot_before" jsonb,
	"snapshot_after" jsonb,
	"checksum" varchar(64) NOT NULL,
	"previous_checksum" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"dashboard_id" text NOT NULL,
	"version" integer NOT NULL,
	"name" varchar NOT NULL,
	"widgets" jsonb DEFAULT '[]'::jsonb,
	"layout" jsonb DEFAULT '[]'::jsonb,
	"change_description" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "dashboard_versions_dashboard_version" UNIQUE("dashboard_id","version")
);
--> statement-breakpoint
CREATE TABLE "digital_twin_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"machine_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"node_bindings" jsonb DEFAULT '[]'::jsonb,
	"display_config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "digital_twin_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"svg_content" text NOT NULL,
	"element_mappings" jsonb DEFAULT '[]'::jsonb,
	"thumbnail" text,
	"category" varchar(100) DEFAULT 'general',
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "edge_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "edge_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "edge_sync_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"table_name" varchar(100) NOT NULL,
	"operation" varchar(10) NOT NULL,
	"record_id" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"sync_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oee_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"running_mode_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idle_mode_values" jsonb DEFAULT '[]'::jsonb,
	"planned_stop_mode_values" jsonb DEFAULT '[]'::jsonb,
	"unplanned_stop_mode_values" jsonb DEFAULT '[]'::jsonb,
	"ideal_cycle_time_ms" real,
	"production_count_node_key" varchar,
	"good_count_node_key" varchar,
	"reject_count_node_key" varchar,
	"manual_entry_enabled" boolean DEFAULT false,
	"planned_production_hours_per_day" real DEFAULT 24,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "oee_config_machine_id_unique" UNIQUE("machine_id")
);
--> statement-breakpoint
CREATE TABLE "oee_manual_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"date" date NOT NULL,
	"production_count" integer,
	"good_count" integer,
	"reject_count" integer,
	"planned_downtime_minutes" integer DEFAULT 0,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "oee_manual_entries_machine_date_unique" UNIQUE("machine_id","date")
);
--> statement-breakpoint
CREATE TABLE "plant_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"plant_id" integer NOT NULL,
	"role" "users_role_enum" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "plant_memberships_user_plant_unique" UNIQUE("user_id","plant_id")
);
--> statement-breakpoint
CREATE TABLE "plants" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"location" varchar(255),
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"description" text,
	"machine_id" integer,
	"status" "recipe_status_enum" DEFAULT 'draft' NOT NULL,
	"parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"setpoints" jsonb DEFAULT '{}'::jsonb,
	"parent_id" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "recipes_name_version" UNIQUE("name","version")
);
--> statement-breakpoint
CREATE TABLE "report_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer,
	"template_id" integer,
	"schedule_name" varchar(255),
	"status" varchar(50) NOT NULL,
	"file_path" varchar(1024),
	"file_size" integer,
	"error" text,
	"generated_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"cron_expression" varchar(100) NOT NULL,
	"timezone" varchar(50) DEFAULT 'UTC',
	"machine_ids" jsonb DEFAULT '[]'::jsonb,
	"recipients" jsonb DEFAULT '[]'::jsonb,
	"delivery_channels" jsonb DEFAULT '["email"]'::jsonb,
	"is_active" boolean DEFAULT true,
	"last_run_at" timestamp with time zone,
	"last_run_status" varchar(50),
	"next_run_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"description" text,
	"template_config" jsonb NOT NULL,
	"plant_id" integer,
	"is_active" boolean DEFAULT true,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spc_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" integer NOT NULL,
	"machine_id" integer,
	"node_key" varchar(255) NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"value" real NOT NULL,
	"threshold" real NOT NULL,
	"message" text NOT NULL,
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spc_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"machine_id" integer,
	"node_key" varchar(255) NOT NULL,
	"method" varchar(50) NOT NULL,
	"window_size" integer DEFAULT 100 NOT NULL,
	"ucl" real,
	"lcl" real,
	"mean" real,
	"stddev" real,
	"sensitivity" real DEFAULT 3,
	"is_active" boolean DEFAULT true,
	"last_computed_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "opcua_data" ALTER COLUMN "value" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "raw_value" jsonb;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "status_code" text;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "data_type" text;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "source_timestamp" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "event_id" text;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_versions" ADD CONSTRAINT "dashboard_versions_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_versions" ADD CONSTRAINT "dashboard_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_instances" ADD CONSTRAINT "digital_twin_instances_template_id_digital_twin_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."digital_twin_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_instances" ADD CONSTRAINT "digital_twin_instances_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_instances" ADD CONSTRAINT "digital_twin_instances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_twin_templates" ADD CONSTRAINT "digital_twin_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oee_config" ADD CONSTRAINT "oee_config_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oee_manual_entries" ADD CONSTRAINT "oee_manual_entries_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oee_manual_entries" ADD CONSTRAINT "oee_manual_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_memberships" ADD CONSTRAINT "plant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_memberships" ADD CONSTRAINT "plant_memberships_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_schedule_id_report_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."report_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spc_alerts" ADD CONSTRAINT "spc_alerts_profile_id_spc_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."spc_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spc_alerts" ADD CONSTRAINT "spc_alerts_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spc_alerts" ADD CONSTRAINT "spc_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spc_profiles" ADD CONSTRAINT "spc_profiles_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spc_profiles" ADD CONSTRAINT "spc_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_history_created_at" ON "alert_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_alert_history_rule" ON "alert_history" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "idx_alert_history_status" ON "alert_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_alert_rules_machine_node" ON "alert_rules" USING btree ("machine_id","node_key","is_active");--> statement-breakpoint
CREATE INDEX "idx_annotations_dashboard" ON "annotations" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "idx_annotations_widget" ON "annotations" USING btree ("widget_id");--> statement-breakpoint
CREATE INDEX "idx_batches_recipe" ON "batches" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_batches_machine" ON "batches" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "idx_batches_status" ON "batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_batches_started_at" ON "batches" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_compliance_audit_created_at" ON "compliance_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_compliance_audit_entity" ON "compliance_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_compliance_audit_user" ON "compliance_audit_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_compliance_audit_checksum" ON "compliance_audit_logs" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "idx_dashboard_versions_dashboard" ON "dashboard_versions" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "idx_digital_twin_instances_machine" ON "digital_twin_instances" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "idx_edge_sync_queue_status" ON "edge_sync_queue" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "idx_edge_sync_queue_created" ON "edge_sync_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_plant_memberships_user" ON "plant_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_plant_memberships_plant" ON "plant_memberships" USING btree ("plant_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_machine" ON "recipes" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_status" ON "recipes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_report_history_schedule" ON "report_history" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "idx_report_history_generated" ON "report_history" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "idx_spc_alerts_profile" ON "spc_alerts" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_spc_alerts_created_at" ON "spc_alerts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_spc_alerts_unacknowledged" ON "spc_alerts" USING btree ("acknowledged_at");--> statement-breakpoint
CREATE INDEX "idx_spc_profiles_machine_node" ON "spc_profiles" USING btree ("machine_id","node_key");--> statement-breakpoint
ALTER TABLE "opcua_data" ADD CONSTRAINT "opcua_data_event_timestamp_unique" UNIQUE("timestamp","event_id");