ALTER TABLE "report_history" ADD COLUMN "run_key" text;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "email_status" varchar(30) DEFAULT 'not-requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "email_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "email_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "email_error" text;--> statement-breakpoint
ALTER TABLE "report_history" ADD COLUMN "email_remaining" jsonb;--> statement-breakpoint
CREATE INDEX "idx_report_history_retry" ON "report_history" USING btree ("retry_at","email_retry_at");--> statement-breakpoint
ALTER TABLE "report_history" ADD CONSTRAINT "report_history_run_key_unique" UNIQUE("run_key");
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "debounce_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "clear_debounce_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD COLUMN "hysteresis" real DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX "idx_alert_history_health" ON "alert_history" USING btree (("metadata"->>'healthKey'),"resolved_at");
