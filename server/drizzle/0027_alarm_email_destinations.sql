ALTER TABLE "webhooks" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "kind" varchar(10) DEFAULT 'webhook' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "recipients" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "min_severity" varchar(20);--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "machine_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;