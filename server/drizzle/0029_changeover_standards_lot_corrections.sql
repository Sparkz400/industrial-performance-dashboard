CREATE TABLE "batch_lot_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"lot_link_id" integer NOT NULL,
	"quantity" double precision,
	"reason" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lot_correction_quantity" CHECK ("batch_lot_corrections"."quantity" IS NULL OR "batch_lot_corrections"."quantity">0)
);
--> statement-breakpoint
CREATE TABLE "changeover_standards" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"from_product" varchar(160) NOT NULL,
	"to_product" varchar(160) NOT NULL,
	"expected_seconds" integer NOT NULL,
	"note" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changeover_expected_seconds" CHECK ("changeover_standards"."expected_seconds" > 0 AND "changeover_standards"."expected_seconds" <= 86400),
	CONSTRAINT "changeover_distinct_products" CHECK ("changeover_standards"."from_product" <> "changeover_standards"."to_product")
);
--> statement-breakpoint
ALTER TABLE "batch_lot_corrections" ADD CONSTRAINT "batch_lot_corrections_lot_link_id_batch_lots_id_fk" FOREIGN KEY ("lot_link_id") REFERENCES "public"."batch_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_lot_corrections" ADD CONSTRAINT "batch_lot_corrections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changeover_standards" ADD CONSTRAINT "changeover_standards_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changeover_standards" ADD CONSTRAINT "changeover_standards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_correction_link" ON "batch_lot_corrections" USING btree ("lot_link_id","id");--> statement-breakpoint
CREATE INDEX "changeover_standard_pair" ON "changeover_standards" USING btree ("machine_id","from_product","to_product");