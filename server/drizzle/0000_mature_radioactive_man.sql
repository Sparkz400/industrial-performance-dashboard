CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'viewer');--> statement-breakpoint
CREATE TABLE "dashboard_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"dashboard_id" varchar NOT NULL,
	"action" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"user_id" varchar
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"widgets" jsonb DEFAULT '[]'::jsonb,
	"layout" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"endpoint_url" varchar NOT NULL,
	"ip" varchar NOT NULL,
	"port" integer DEFAULT 4840 NOT NULL,
	"resource_path" varchar DEFAULT '',
	"security_mode" varchar DEFAULT 'None',
	"security_policy" varchar DEFAULT 'None',
	"is_active" boolean DEFAULT true,
	"status" varchar DEFAULT 'disconnected',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "machines_endpoint_url_unique" UNIQUE("endpoint_url")
);
--> statement-breakpoint
CREATE TABLE "node_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"node_id" varchar NOT NULL,
	"node_key" varchar NOT NULL,
	"display_name" varchar NOT NULL,
	"data_type" varchar DEFAULT 'Double',
	"sampling_interval" integer DEFAULT 500,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "node_mappings_machine_id_node_id_unique" UNIQUE("machine_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "opcua_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_key" varchar NOT NULL,
	"node_label" varchar,
	"timestamp" timestamp with time zone NOT NULL,
	"value" real,
	"machine_id" integer
);
--> statement-breakpoint
CREATE TABLE "opcua_data_dlq" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_message" text NOT NULL,
	"batch_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" "users_role_enum" DEFAULT 'viewer' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "node_mappings" ADD CONSTRAINT "node_mappings_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD CONSTRAINT "opcua_data_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dashboard_history_dashboard_id" ON "dashboard_history" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "idx_dashboard_history_timestamp" ON "dashboard_history" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_node_mappings_machine_active" ON "node_mappings" USING btree ("machine_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_opcua_data_node_key_timestamp" ON "opcua_data" USING btree ("node_key","timestamp");--> statement-breakpoint
CREATE INDEX "idx_opcua_data_machine_node_timestamp" ON "opcua_data" USING btree ("machine_id","node_key","timestamp");--> statement-breakpoint
CREATE INDEX "idx_session_expire" ON "session" USING btree ("expire");