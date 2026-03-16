const getBooleanResult = (result, key) =>
  result?.rows?.[0]?.[key] ?? result?.[0]?.[0]?.[key] ?? false;

async function isTimescaleAvailable(knex) {
  const result = await knex.raw(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_available_extensions
      WHERE name = 'timescaledb'
    ) AS available
  `);
  return Boolean(getBooleanResult(result, "available"));
}

export async function up(knex) {
  const timescaleAvailable = await isTimescaleAvailable(knex);
  if (!timescaleAvailable) {
    console.info(
      "[migration:011] TimescaleDB not available. Skipping daily/weekly aggregates.",
    );
    return;
  }

  // --- Daily continuous aggregate ---
  try {
    await knex.raw(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS opcua_data_daily
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket(INTERVAL '1 day', "timestamp") AS bucket,
        node_key,
        machine_id,
        avg(value) AS avg_value,
        min(value) AS min_value,
        max(value) AS max_value,
        count(*)::bigint AS sample_count
      FROM opcua_data
      GROUP BY bucket, node_key, machine_id
      WITH NO DATA
    `);

    await knex.raw(`
      SELECT add_continuous_aggregate_policy(
        'opcua_data_daily',
        start_offset => INTERVAL '90 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      )
    `);

    console.info("[migration:011] Created opcua_data_daily continuous aggregate.");
  } catch (error) {
    console.warn(
      "[migration:011] Skipping daily aggregate setup:",
      error.message,
    );
  }

  // --- Weekly continuous aggregate ---
  try {
    await knex.raw(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS opcua_data_weekly
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket(INTERVAL '1 week', "timestamp") AS bucket,
        node_key,
        machine_id,
        avg(value) AS avg_value,
        min(value) AS min_value,
        max(value) AS max_value,
        count(*)::bigint AS sample_count
      FROM opcua_data
      GROUP BY bucket, node_key, machine_id
      WITH NO DATA
    `);

    await knex.raw(`
      SELECT add_continuous_aggregate_policy(
        'opcua_data_weekly',
        start_offset => INTERVAL '365 days',
        end_offset => INTERVAL '6 hours',
        schedule_interval => INTERVAL '6 hours',
        if_not_exists => TRUE
      )
    `);

    console.info("[migration:011] Created opcua_data_weekly continuous aggregate.");
  } catch (error) {
    console.warn(
      "[migration:011] Skipping weekly aggregate setup:",
      error.message,
    );
  }
}

export async function down(knex) {
  const timescaleAvailable = await isTimescaleAvailable(knex);
  if (!timescaleAvailable) return;

  try {
    await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS opcua_data_weekly`);
  } catch (error) {
    console.warn("[migration:011] Failed to drop opcua_data_weekly:", error.message);
  }

  try {
    await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS opcua_data_daily`);
  } catch (error) {
    console.warn("[migration:011] Failed to drop opcua_data_daily:", error.message);
  }
}
