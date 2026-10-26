CREATE TABLE "downtime_reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_id" integer NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"category" varchar(20) NOT NULL,
	"reason" varchar(500) NOT NULL,
	"supersedes_id" integer,
	"actor_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "downtime_reasons_supersedes_id_unique" UNIQUE("supersedes_id")
);
--> statement-breakpoint
CREATE TABLE "machine_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"profile" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"profile" jsonb NOT NULL,
	"job" jsonb NOT NULL,
	"breaks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "downtime_reasons" ADD CONSTRAINT "downtime_reasons_shift_id_production_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."production_shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downtime_reasons" ADD CONSTRAINT "downtime_reasons_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_profiles" ADD CONSTRAINT "machine_profiles_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_profiles" ADD CONSTRAINT "machine_profiles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shifts" ADD CONSTRAINT "production_shifts_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shifts" ADD CONSTRAINT "production_shifts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;