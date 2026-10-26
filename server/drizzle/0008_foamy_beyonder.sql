ALTER TYPE "public"."users_role_enum" ADD VALUE 'wallboard';--> statement-breakpoint
CREATE TABLE "operator_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" varchar(36) NOT NULL,
	"machine_id" integer NOT NULL,
	"shift_id" integer,
	"kind" varchar(20) NOT NULL,
	"text" text NOT NULL,
	"priority" varchar(10) DEFAULT 'normal' NOT NULL,
	"status" varchar(10) DEFAULT 'open' NOT NULL,
	"owner_id" integer,
	"due_at" timestamp with time zone,
	"interval_start" timestamp with time zone,
	"interval_end" timestamp with time zone,
	"quantity" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_entries_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "operator_entry_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"actor_id" integer NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_entry_version_unique" UNIQUE("entry_id","version")
);
--> statement-breakpoint
ALTER TABLE "operator_entries" ADD CONSTRAINT "operator_entries_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_entries" ADD CONSTRAINT "operator_entries_shift_id_production_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."production_shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_entries" ADD CONSTRAINT "operator_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_entries" ADD CONSTRAINT "operator_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_entry_events" ADD CONSTRAINT "operator_entry_events_entry_id_operator_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."operator_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_entry_events" ADD CONSTRAINT "operator_entry_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_operator_entries_machine_status" ON "operator_entries" USING btree ("machine_id","status","updated_at");