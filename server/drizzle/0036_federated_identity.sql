CREATE TABLE "oidc_group_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_name" varchar(256) NOT NULL,
	"role" "users_role_enum" NOT NULL,
	"plant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_group_mappings_group_name_unique" UNIQUE("group_name"),
	CONSTRAINT "oidc_group_not_admin" CHECK ("oidc_group_mappings"."role" <> 'admin')
);
--> statement-breakpoint
CREATE TABLE "service_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_source" varchar(10) DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oidc_issuer" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "oidc_subject" varchar(255);--> statement-breakpoint
ALTER TABLE "oidc_group_mappings" ADD CONSTRAINT "oidc_group_mappings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tokens" ADD CONSTRAINT "service_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tokens" ADD CONSTRAINT "service_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_oidc_identity" ON "users" USING btree ("oidc_issuer","oidc_subject");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_auth_source" CHECK ("users"."auth_source" IN ('local','oidc','service') AND ("users"."auth_source" = 'local') = ("users"."password_hash" IS NOT NULL) AND ("users"."auth_source" = 'oidc') = ("users"."oidc_subject" IS NOT NULL));