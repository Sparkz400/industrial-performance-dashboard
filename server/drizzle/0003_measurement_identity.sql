ALTER TABLE "opcua_data" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opcua_data" ADD COLUMN "signal_metadata" jsonb;