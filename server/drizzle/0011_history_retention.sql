CREATE TABLE "history_summaries" (
	"machine_id" integer NOT NULL,
	"node_key" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"samples" integer NOT NULL,
	"good" integer NOT NULL,
	"sum" double precision,
	"min" double precision,
	"max" double precision,
	CONSTRAINT "history_summaries_machine_id_node_key_bucket_pk" PRIMARY KEY("machine_id","node_key","bucket")
);
--> statement-breakpoint
CREATE TABLE "retention_policies" (
	"machine_id" integer PRIMARY KEY NOT NULL,
	"days" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" integer NOT NULL,
	"policy_version" integer NOT NULL,
	"cutoff" timestamp with time zone NOT NULL,
	"max_id" integer NOT NULL,
	"rows" integer NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL
);
