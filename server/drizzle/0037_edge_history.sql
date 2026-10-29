CREATE TABLE "edge_config_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"edge_id" integer NOT NULL,
	"revision" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"settings" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_config_revision" UNIQUE("edge_id","revision")
);
--> statement-breakpoint
CREATE TABLE "edge_link" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"central_url" text NOT NULL,
	"ca_certificate" text NOT NULL,
	"sealed_token" text NOT NULL,
	"edge_name" varchar(100) NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"horizon_id" integer,
	"horizon_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"config_revision" integer DEFAULT 0 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config_rejection" text,
	"enrolled_by" integer NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_link_single" CHECK ("edge_link"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "edge_machines" (
	"edge_id" integer NOT NULL,
	"remote_machine_id" integer NOT NULL,
	"machine_id" integer NOT NULL,
	"remote_name" varchar(255) NOT NULL,
	"definition_digest" varchar(64),
	CONSTRAINT "edge_machines_edge_id_remote_machine_id_pk" PRIMARY KEY("edge_id","remote_machine_id"),
	CONSTRAINT "edge_machines_machine_id_unique" UNIQUE("machine_id")
);
--> statement-breakpoint
CREATE TABLE "edge_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"plant_id" integer NOT NULL,
	"enrollment_hash" varchar(64),
	"enrollment_expires_at" timestamp with time zone,
	"token_hash" varchar(64),
	"enrolled_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_contact_at" timestamp with time zone,
	"last_batch_at" timestamp with time zone,
	"acknowledged_cursor" integer DEFAULT 0 NOT NULL,
	"backlog" integer,
	"newest_reading_at" timestamp with time zone,
	"software_version" varchar(40),
	"schema_version" integer,
	"target_version" varchar(40),
	"applied_config_revision" integer,
	"config_rejection" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_nodes_name_unique" UNIQUE("name"),
	CONSTRAINT "edge_nodes_enrollment_hash_unique" UNIQUE("enrollment_hash"),
	CONSTRAINT "edge_nodes_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "edge_config_revisions" ADD CONSTRAINT "edge_config_revisions_edge_id_edge_nodes_id_fk" FOREIGN KEY ("edge_id") REFERENCES "public"."edge_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_config_revisions" ADD CONSTRAINT "edge_config_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_link" ADD CONSTRAINT "edge_link_enrolled_by_users_id_fk" FOREIGN KEY ("enrolled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_machines" ADD CONSTRAINT "edge_machines_edge_id_edge_nodes_id_fk" FOREIGN KEY ("edge_id") REFERENCES "public"."edge_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_machines" ADD CONSTRAINT "edge_machines_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_nodes" ADD CONSTRAINT "edge_nodes_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_nodes" ADD CONSTRAINT "edge_nodes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_opcua_data_id" ON "opcua_data" USING btree ("id");