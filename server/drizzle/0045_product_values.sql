CREATE TABLE "product_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"product" varchar(160) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"unit_value" double precision NOT NULL,
	"scrap_cost" double precision NOT NULL,
	"reference" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_value_amounts" CHECK ("product_values"."unit_value" >= 0 AND "product_values"."scrap_cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_values" ADD CONSTRAINT "product_values_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_values_product" ON "product_values" USING btree ("product","id");