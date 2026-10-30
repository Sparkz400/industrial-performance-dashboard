CREATE TABLE "recommendation_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"key" varchar(300) NOT NULL,
	"decision" varchar(10) NOT NULL,
	"reason" text,
	"improvement_action_id" integer,
	"maintenance_action_id" integer,
	"decided_by" integer NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendation_decision_key" UNIQUE("machine_id","key"),
	CONSTRAINT "recommendation_decision_kind" CHECK (("recommendation_decisions"."decision" = 'dismissed' AND "recommendation_decisions"."reason" IS NOT NULL) OR ("recommendation_decisions"."decision" = 'accepted' AND ("recommendation_decisions"."improvement_action_id" IS NOT NULL OR "recommendation_decisions"."maintenance_action_id" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "usefulness_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"source" varchar(20) NOT NULL,
	"event" varchar(20) NOT NULL,
	"key" varchar(300),
	"user_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usefulness_event_kind" CHECK ("usefulness_events"."source" IN ('recommendations','ranked-losses') AND "usefulness_events"."event" IN ('shown','accepted','dismissed'))
);
--> statement-breakpoint
ALTER TABLE "recommendation_decisions" ADD CONSTRAINT "recommendation_decisions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_decisions" ADD CONSTRAINT "recommendation_decisions_improvement_action_id_improvement_actions_id_fk" FOREIGN KEY ("improvement_action_id") REFERENCES "public"."improvement_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_decisions" ADD CONSTRAINT "recommendation_decisions_maintenance_action_id_maintenance_actions_id_fk" FOREIGN KEY ("maintenance_action_id") REFERENCES "public"."maintenance_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_decisions" ADD CONSTRAINT "recommendation_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usefulness_events" ADD CONSTRAINT "usefulness_events_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usefulness_events" ADD CONSTRAINT "usefulness_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usefulness_machine_at" ON "usefulness_events" USING btree ("machine_id","at");