CREATE TABLE "energy_reconciliations" (
	"shift_id" integer PRIMARY KEY NOT NULL,
	"kwh" double precision NOT NULL,
	"tolerance_kwh" double precision NOT NULL,
	"reference" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "history_summaries" ADD COLUMN "identity" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "energy_reconciliations" ADD CONSTRAINT "energy_reconciliations_shift_id_production_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."production_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_reconciliations" ADD CONSTRAINT "energy_reconciliations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;