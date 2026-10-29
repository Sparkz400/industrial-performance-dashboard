ALTER TABLE "share_tokens" ALTER COLUMN "token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "selection" jsonb;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "window_hours" integer;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD COLUMN "revoked_by" integer;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_token_hash_unique" UNIQUE("token_hash");