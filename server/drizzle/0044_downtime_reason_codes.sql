CREATE TABLE "downtime_reason_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(20) NOT NULL,
	"label" varchar(200) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "downtime_reason_code_label" UNIQUE("category","label"),
	CONSTRAINT "downtime_reason_code_category" CHECK ("downtime_reason_codes"."category" IN ('planned','unplanned','changeover'))
);
--> statement-breakpoint
ALTER TABLE "downtime_reasons" ADD COLUMN "code_id" integer;--> statement-breakpoint
ALTER TABLE "downtime_reasons" ADD CONSTRAINT "downtime_reasons_code_id_downtime_reason_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."downtime_reason_codes"("id") ON DELETE no action ON UPDATE no action;