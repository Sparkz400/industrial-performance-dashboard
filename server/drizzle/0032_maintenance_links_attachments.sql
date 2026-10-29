CREATE TABLE "maintenance_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"filename" varchar(200) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"data" "bytea" NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_attachment_size" CHECK ("maintenance_attachments"."size" > 0 AND "maintenance_attachments"."size" <= 5242880)
);
--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD COLUMN "stop_id" integer;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD COLUMN "trend_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD COLUMN "trend_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD COLUMN "trend_keys" jsonb;--> statement-breakpoint
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_event_id_maintenance_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."maintenance_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_attachments" ADD CONSTRAINT "maintenance_attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_attachment_event" ON "maintenance_attachments" USING btree ("event_id");--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_events_stop_id_downtime_reasons_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."downtime_reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_events" ADD CONSTRAINT "maintenance_event_trend" CHECK (("maintenance_events"."trend_start" IS NULL AND "maintenance_events"."trend_end" IS NULL AND "maintenance_events"."trend_keys" IS NULL)
        OR ("maintenance_events"."trend_end" > "maintenance_events"."trend_start" AND "maintenance_events"."trend_keys" IS NOT NULL));