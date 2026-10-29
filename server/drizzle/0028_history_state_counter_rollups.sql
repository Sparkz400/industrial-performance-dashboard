CREATE TABLE "history_counter_increments" (
	"machine_id" integer NOT NULL,
	"node_key" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"increment" double precision NOT NULL,
	"pairs" integer NOT NULL,
	"unknown_pairs" integer NOT NULL,
	CONSTRAINT "history_counter_increments_machine_id_node_key_bucket_pk" PRIMARY KEY("machine_id","node_key","bucket")
);
--> statement-breakpoint
CREATE TABLE "history_state_seconds" (
	"machine_id" integer NOT NULL,
	"node_key" text NOT NULL,
	"bucket" timestamp with time zone NOT NULL,
	"state" varchar(20) NOT NULL,
	"seconds" double precision NOT NULL,
	CONSTRAINT "history_state_seconds_machine_id_node_key_bucket_state_pk" PRIMARY KEY("machine_id","node_key","bucket","state")
);
