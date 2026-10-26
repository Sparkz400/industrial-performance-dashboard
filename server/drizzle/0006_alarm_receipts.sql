CREATE TABLE "alarm_evaluation_receipts" (
	"key" varchar PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alarm_evaluation_receipts" ADD CONSTRAINT "alarm_evaluation_receipts_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;