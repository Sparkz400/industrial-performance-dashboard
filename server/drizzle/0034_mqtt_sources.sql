CREATE TABLE "mqtt_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"broker_url" text NOT NULL,
	"ca_certificate" text NOT NULL,
	"username" varchar(200),
	"encrypted_password" text,
	"client_id" varchar(23) NOT NULL,
	"mappings" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mqtt_sources_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "mqtt_sources" ADD CONSTRAINT "mqtt_sources_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mqtt_sources" ADD CONSTRAINT "mqtt_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;