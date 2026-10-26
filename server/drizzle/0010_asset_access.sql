ALTER TYPE "public"."users_role_enum" ADD VALUE 'operator';--> statement-breakpoint
ALTER TYPE "public"."users_role_enum" ADD VALUE 'supervisor';--> statement-breakpoint
CREATE TABLE "dashboard_assets" (
	"dashboard_id" text NOT NULL,
	"machine_id" integer NOT NULL,
	CONSTRAINT "dashboard_assets_dashboard_id_machine_id_pk" PRIMARY KEY("dashboard_id","machine_id")
);
--> statement-breakpoint
CREATE TABLE "machine_grants" (
	"user_id" integer NOT NULL,
	"machine_id" integer NOT NULL,
	CONSTRAINT "machine_grants_user_id_machine_id_pk" PRIMARY KEY("user_id","machine_id")
);
--> statement-breakpoint
CREATE TABLE "machine_sites" (
	"machine_id" integer PRIMARY KEY NOT NULL,
	"plant_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_assets" ADD CONSTRAINT "dashboard_assets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_assets" ADD CONSTRAINT "dashboard_assets_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_grants" ADD CONSTRAINT "machine_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_grants" ADD CONSTRAINT "machine_grants_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_sites" ADD CONSTRAINT "machine_sites_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_sites" ADD CONSTRAINT "machine_sites_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Preserve existing read visibility; future accounts and machines need explicit grants.
INSERT INTO machine_grants (user_id, machine_id) SELECT users.id, machines.id FROM users CROSS JOIN machines WHERE users.role <> 'admin' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO dashboard_assets (dashboard_id, machine_id) SELECT dashboards.id, machines.id FROM dashboards CROSS JOIN machines ON CONFLICT DO NOTHING;
