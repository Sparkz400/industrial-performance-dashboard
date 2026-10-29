CREATE TABLE "alert_rule_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"rule" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_rule_versions" ADD CONSTRAINT "alert_rule_versions_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_rule_versions_rule" ON "alert_rule_versions" USING btree ("rule_id","effective_at");--> statement-breakpoint
CREATE FUNCTION "record_alert_rule_version"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "alert_rule_versions"("rule_id", "effective_at", "rule")
  VALUES (NEW."id", coalesce(NEW."updated_at", now()), to_jsonb(NEW));
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER "alert_rule_versions_capture" AFTER INSERT OR UPDATE ON "alert_rules"
  FOR EACH ROW EXECUTE FUNCTION "record_alert_rule_version"();--> statement-breakpoint
INSERT INTO "alert_rule_versions"("rule_id", "effective_at", "rule")
  SELECT "id", coalesce("updated_at", "created_at", now()), to_jsonb("alert_rules") FROM "alert_rules";
