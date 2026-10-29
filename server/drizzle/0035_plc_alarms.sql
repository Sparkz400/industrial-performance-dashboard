CREATE TABLE "plc_alarm_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"event_id" varchar(200) NOT NULL,
	"event_type" varchar(200) NOT NULL,
	"condition_id" varchar(500),
	"condition_name" varchar(500),
	"source_name" varchar(500),
	"source_node" varchar(500),
	"event_time" timestamp with time zone NOT NULL,
	"receive_time" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"severity" integer NOT NULL,
	"message" text,
	"active" boolean,
	"acked" boolean,
	"retain" boolean,
	"refresh" boolean NOT NULL,
	CONSTRAINT "plc_alarm_event_identity" UNIQUE("machine_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "plc_alarm_subscriptions" (
	"machine_id" integer PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plc_alarm_events" ADD CONSTRAINT "plc_alarm_events_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_alarm_subscriptions" ADD CONSTRAINT "plc_alarm_subscriptions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_alarm_subscriptions" ADD CONSTRAINT "plc_alarm_subscriptions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plc_alarm_event_time" ON "plc_alarm_events" USING btree ("machine_id","event_time");