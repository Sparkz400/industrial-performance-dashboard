CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(255),
	"entity_name" varchar(255),
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"user_id" integer,
	"username" varchar(100),
	"user_role" "users_role_enum",
	"ip_address" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_created_at" ON "audit_logs" USING btree ("user_id","created_at");
