ALTER TABLE "operator_entries" ADD COLUMN "manual_state" varchar(10);--> statement-breakpoint
ALTER TABLE "operator_entries" ADD CONSTRAINT "operator_manual_state" CHECK (("operator_entries"."kind"='state' AND "operator_entries"."manual_state" IN ('running','idle','fault','planned'))
        OR ("operator_entries"."kind"<>'state' AND "operator_entries"."manual_state" IS NULL));