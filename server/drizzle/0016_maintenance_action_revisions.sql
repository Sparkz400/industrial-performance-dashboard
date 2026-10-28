ALTER TABLE "maintenance_actions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "maintenance_actions" ADD COLUMN "revisions" jsonb DEFAULT '[]'::jsonb NOT NULL;