CREATE TABLE "machine_credentials" (
	"machine_id" integer PRIMARY KEY NOT NULL,
	"mode" varchar(20) NOT NULL,
	"username" varchar(255),
	"certificate_expires_at" timestamp with time zone,
	"encrypted_secret" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "machine_credentials" ADD CONSTRAINT "machine_credentials_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;