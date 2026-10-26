-- Older snapshots contained these tables without the corresponding CREATE statements.
-- Preserve installations that already created them through schema synchronization.
CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" serial PRIMARY KEY, "name" varchar(255) NOT NULL, "url" varchar(2048) NOT NULL,
  "secret" varchar(255) NOT NULL, "events" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL, "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "last_triggered_at" timestamptz, "last_status" integer,
  "created_at" timestamptz DEFAULT now(), "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_tokens" (
  "id" serial PRIMARY KEY, "dashboard_id" text NOT NULL REFERENCES "dashboards"("id") ON DELETE CASCADE,
  "token" varchar(64) NOT NULL UNIQUE, "expires_at" timestamptz, "is_active" boolean DEFAULT true NOT NULL,
  "allow_embed" boolean DEFAULT false NOT NULL, "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_share_tokens_token" ON "share_tokens" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_share_tokens_dashboard" ON "share_tokens" ("dashboard_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_widgets" (
  "id" serial PRIMARY KEY, "manifest_url" varchar(2048) NOT NULL UNIQUE, "manifest" jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL, "installed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz DEFAULT now(), "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alarm_evaluation_state" (
	"key" varchar PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"state" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"webhook_id" integer NOT NULL,
	"event" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alarm_evaluation_state" ADD CONSTRAINT "alarm_evaluation_state_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;
