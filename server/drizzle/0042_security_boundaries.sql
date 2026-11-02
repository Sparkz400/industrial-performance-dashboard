CREATE TABLE auth_rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL CHECK (hits >= 0),
  reset_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits (reset_at);
--> statement-breakpoint
-- Policies are maintained here, rather than generated from the ORM schema.
-- A connection without an explicit server-owned scope fails closed.
CREATE FUNCTION public.app_asset_access(kind text, asset text) RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT coalesce(
    scope->>'role' IN ('admin', 'system') OR
    CASE kind
      WHEN 'machine' THEN scope->'machineIds' @> jsonb_build_array(asset::integer)
      WHEN 'dashboard' THEN scope->'dashboardIds' @> jsonb_build_array(asset)
      ELSE false
    END, false)
  FROM (SELECT nullif(current_setting('app.access_scope', true), '')::jsonb AS scope) s
$$;
--> statement-breakpoint
DO $$
DECLARE item record; predicate text;
BEGIN
  FOR item IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name IN ('machine_id', 'dashboard_id')
    UNION ALL SELECT 'machines', 'id'
    UNION ALL SELECT 'dashboards', 'id'
  LOOP
    predicate := format('public.app_asset_access(%L, %I::text)',
      CASE WHEN item.column_name = 'dashboard_id' OR item.table_name = 'dashboards' THEN 'dashboard' ELSE 'machine' END,
      item.column_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', item.table_name);
    -- Multiple asset columns must all match, so each column is a restrictive policy.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=item.table_name AND policyname='asset_base') THEN
      EXECUTE format('CREATE POLICY asset_base ON public.%I USING (true) WITH CHECK (true)', item.table_name);
    END IF;
    EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE USING (%s) WITH CHECK (%s)',
      'asset_' || item.column_name, item.table_name, predicate, predicate);
  END LOOP;
END $$;
--> statement-breakpoint
DO $$
DECLARE item record; predicate text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('shift_report_revisions', 'shift_id', 'production_shifts'),
    ('energy_reconciliations', 'shift_id', 'production_shifts'),
    ('downtime_reasons', 'shift_id', 'production_shifts'),
    ('job_inspections', 'shift_id', 'production_shifts'),
    ('maintenance_events', 'plan_id', 'maintenance_plans'),
    ('maintenance_attachments', 'event_id', 'maintenance_events'),
    ('operator_entry_events', 'entry_id', 'operator_entries'),
    ('quality_inspections', 'batch_id', 'batches'),
    ('batch_rework', 'batch_id', 'batches'),
    ('batch_lots', 'batch_id', 'batches'),
    ('batch_lot_corrections', 'lot_link_id', 'batch_lots'),
    ('spc_baselines', 'profile_id', 'spc_profiles'),
    ('maintenance_action_revisions', 'action_id', 'maintenance_actions'),
    ('retention_preview_rows', 'preview_id', 'retention_previews'),
    ('alert_rule_versions', 'rule_id', 'alert_rules'),
    ('alarm_evaluation_state', 'rule_id', 'alert_rules'),
    ('alarm_evaluation_receipts', 'rule_id', 'alert_rules')
  ) AS ownership(child, column_name, parent)
  LOOP
    predicate := format('public.app_asset_access(''system'', NULL) OR EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I)', item.parent, item.child, item.column_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.child);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', item.child);
    EXECUTE format('CREATE POLICY asset_parent ON public.%I USING (%s) WITH CHECK (%s)', item.child, predicate, predicate);
  END LOOP;
END $$;
