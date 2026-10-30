CREATE TABLE "maintenance_action_revisions" (
	"action_id" integer NOT NULL,
	"version" integer NOT NULL,
	"revision" jsonb NOT NULL,
	CONSTRAINT "maintenance_action_revisions_action_id_version_pk" PRIMARY KEY("action_id","version")
);
--> statement-breakpoint
ALTER TABLE "maintenance_action_revisions" ADD CONSTRAINT "maintenance_action_revisions_action_id_maintenance_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."maintenance_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
LOCK TABLE "maintenance_actions" IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
INSERT INTO "maintenance_action_revisions" ("action_id", "version", "revision")
SELECT a.id, (r.value->'previous'->>'version')::integer, r.value
FROM "maintenance_actions" a CROSS JOIN LATERAL jsonb_array_elements(a.revisions) r(value);
--> statement-breakpoint
ALTER TABLE "maintenance_actions" DROP COLUMN "revisions";
