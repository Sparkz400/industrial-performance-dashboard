CREATE TABLE "improvement_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"implemented_at" timestamp with time zone NOT NULL,
	"before_revision_ids" jsonb NOT NULL,
	"after_revision_ids" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "improvement_action_machine" ON "improvement_actions" USING btree ("machine_id","id");