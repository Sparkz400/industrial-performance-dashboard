ALTER TABLE batches ADD COLUMN recipe_snapshot jsonb;
--> statement-breakpoint
CREATE TABLE quality_inspections (
 id serial PRIMARY KEY, batch_id integer NOT NULL REFERENCES batches(id), request_id text NOT NULL UNIQUE,
 check_name text NOT NULL, result text NOT NULL CONSTRAINT quality_result CHECK(result IN ('pass','fail','unknown')), quantity integer NOT NULL CONSTRAINT quality_quantity CHECK(quantity>0),
 defect_reason text, note text NOT NULL, created_by integer NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT quality_defect CHECK(result<>'fail' OR coalesce(length(trim(defect_reason)),0)>0)
);
CREATE INDEX quality_inspections_batch ON quality_inspections(batch_id);
CREATE TABLE batch_rework (
 id serial PRIMARY KEY, batch_id integer NOT NULL REFERENCES batches(id), inspection_id integer NOT NULL UNIQUE REFERENCES quality_inspections(id),
 owner_id integer NOT NULL REFERENCES users(id), due_at timestamptz NOT NULL, action text NOT NULL,
 created_by integer NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 completed_by integer REFERENCES users(id), completed_at timestamptz, completion_note text, verification_id integer REFERENCES quality_inspections(id)
);
CREATE TABLE batch_lots (
 id serial PRIMARY KEY, batch_id integer NOT NULL REFERENCES batches(id), lot text NOT NULL,
 direction text NOT NULL CONSTRAINT lot_direction CHECK(direction IN ('input','output')), quantity double precision NOT NULL CONSTRAINT lot_quantity CHECK(quantity>0), unit text NOT NULL,
 supplier_reference text, created_by integer NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(batch_id,lot)
);
CREATE UNIQUE INDEX lot_producer ON batch_lots(lot) WHERE direction='output';
CREATE INDEX lot_trace ON batch_lots(lot);
--> statement-breakpoint
CREATE TABLE spc_baselines (
 id serial PRIMARY KEY, profile_id integer NOT NULL REFERENCES spc_profiles(id), evidence jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), approved_by integer REFERENCES users(id), approved_at timestamptz,
 review text, superseded boolean NOT NULL DEFAULT false
);
CREATE TABLE production_lines (id serial PRIMARY KEY,config jsonb NOT NULL,created_by integer NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE maintenance_actions (
 id serial PRIMARY KEY,machine_id integer NOT NULL REFERENCES machines(id),alarm_id integer NOT NULL UNIQUE REFERENCES alert_history(id),
 owner_id integer NOT NULL REFERENCES users(id),escalation_owner_id integer NOT NULL REFERENCES users(id),due_at timestamptz NOT NULL,action text NOT NULL,
 suppression_until timestamptz,quiet_start integer,quiet_end integer,escalated_at timestamptz,
 created_by integer NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,completed_by integer REFERENCES users(id),service_event_id integer REFERENCES maintenance_events(id),completion_note text
);
CREATE INDEX maintenance_action_due ON maintenance_actions(due_at) WHERE completed_at IS NULL;
CREATE TABLE storage_observations(kind text NOT NULL,path text NOT NULL,observed_at timestamptz NOT NULL,free_bytes bigint NOT NULL,PRIMARY KEY(kind,path,observed_at));
CREATE TABLE retention_schedules(id serial PRIMARY KEY,machine_id integer NOT NULL,preview_id text NOT NULL UNIQUE REFERENCES retention_previews(id),confirm_rows integer NOT NULL,created_by integer NOT NULL REFERENCES users(id),run_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'scheduled',error text);
CREATE TABLE retention_preview_rows(preview_id text NOT NULL REFERENCES retention_previews(id) ON DELETE CASCADE,measurement_id integer NOT NULL,timestamp timestamptz NOT NULL,PRIMARY KEY(preview_id,timestamp,measurement_id));
