CREATE TABLE "inspection_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"product" varchar(160) NOT NULL,
	"checks" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" varchar(36) NOT NULL,
	"shift_id" integer NOT NULL,
	"product" varchar(160) NOT NULL,
	"plan_id" integer,
	"check_name" varchar(200) NOT NULL,
	"result" varchar(10) NOT NULL,
	"quantity" integer NOT NULL,
	"defect_reason" text,
	"note" text DEFAULT '' NOT NULL,
	"reinspects_id" integer,
	"supersedes_id" integer,
	"correction_reason" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_inspections_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "job_inspections_supersedes_id_unique" UNIQUE("supersedes_id"),
	CONSTRAINT "job_inspection_result" CHECK ("job_inspections"."result" IN ('pass','fail','unknown')),
	CONSTRAINT "job_inspection_quantity" CHECK ("job_inspections"."quantity">0),
	CONSTRAINT "job_inspection_defect" CHECK (("job_inspections"."result"='fail') = ("job_inspections"."defect_reason" IS NOT NULL)),
	CONSTRAINT "job_inspection_correction" CHECK (("job_inspections"."supersedes_id" IS NULL) = ("job_inspections"."correction_reason" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "inspection_plans" ADD CONSTRAINT "inspection_plans_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_plans" ADD CONSTRAINT "inspection_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_inspections" ADD CONSTRAINT "job_inspections_shift_id_production_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."production_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_inspections" ADD CONSTRAINT "job_inspections_plan_id_inspection_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."inspection_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_inspections" ADD CONSTRAINT "job_inspections_reinspects_id_job_inspections_id_fk" FOREIGN KEY ("reinspects_id") REFERENCES "public"."job_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_inspections" ADD CONSTRAINT "job_inspections_supersedes_id_job_inspections_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."job_inspections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_inspections" ADD CONSTRAINT "job_inspections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspection_plan_product" ON "inspection_plans" USING btree ("machine_id","product","id");--> statement-breakpoint
CREATE INDEX "job_inspection_shift" ON "job_inspections" USING btree ("shift_id","id");