CREATE TABLE "collector_epochs" (
	"epoch" serial PRIMARY KEY NOT NULL,
	"holder" varchar(200) NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL
);
