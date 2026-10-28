CREATE TABLE "cmms_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"action_id" integer NOT NULL,
	"action_version" integer NOT NULL,
	"webhook_id" integer NOT NULL,
	"delivery_id" integer NOT NULL,
	"destination_digest" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cmms_handoffs_delivery_id_unique" UNIQUE("delivery_id"),
	CONSTRAINT "cmms_handoffs_action_id_webhook_id_unique" UNIQUE("action_id","webhook_id")
);
--> statement-breakpoint
CREATE TABLE "derived_signal_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"expression" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derived_signal_definitions_machine_id_name_version_unique" UNIQUE("machine_id","name","version")
);
--> statement-breakpoint
CREATE TABLE "energy_tariffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"version" integer NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"price_per_kwh" double precision NOT NULL,
	"kg_co2e_per_kwh" double precision,
	"reference" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "energy_tariffs_machine_id_version_unique" UNIQUE("machine_id","version")
);
--> statement-breakpoint
CREATE TABLE "measurement_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"measurement_id" integer NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"revision" integer NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurement_corrections_measured_at_measurement_id_revision_unique" UNIQUE("measured_at","measurement_id","revision")
);
--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "reported_status_code" text;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "source_clock_state" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "correction_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cmms_handoffs" ADD CONSTRAINT "cmms_handoffs_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmms_handoffs" ADD CONSTRAINT "cmms_handoffs_action_id_maintenance_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."maintenance_actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmms_handoffs" ADD CONSTRAINT "cmms_handoffs_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmms_handoffs" ADD CONSTRAINT "cmms_handoffs_delivery_id_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cmms_handoffs" ADD CONSTRAINT "cmms_handoffs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_signal_definitions" ADD CONSTRAINT "derived_signal_definitions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_signal_definitions" ADD CONSTRAINT "derived_signal_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_tariffs" ADD CONSTRAINT "energy_tariffs_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_tariffs" ADD CONSTRAINT "energy_tariffs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_corrections" ADD CONSTRAINT "measurement_corrections_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_corrections" ADD CONSTRAINT "measurement_corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;