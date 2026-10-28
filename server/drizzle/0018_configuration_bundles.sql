CREATE TABLE "config_bundle_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"digest" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rolled_back_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "config_bundle_imports" ADD CONSTRAINT "config_bundle_imports_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_bundle_imports" ADD CONSTRAINT "config_bundle_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;