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

async function isHypertable(knex) {
  const result = await knex.raw(`
    SELECT EXISTS (
      SELECT 1
      FROM timescaledb_information.hypertables
      WHERE hypertable_schema = current_schema()
        AND hypertable_name = 'opcua_data'
    ) AS is_hypertable
  `);

  return Boolean(getBooleanResult(result, "is_hypertable"));
}

export async function up(knex) {
  await knex.raw(`
    ALTER TABLE opcua_data
    DROP CONSTRAINT IF EXISTS opcua_data_pkey
  `);

  await knex.raw(`
    ALTER TABLE opcua_data
    ADD CONSTRAINT opcua_data_pkey PRIMARY KEY ("timestamp", id)
  `);

  const timescaleAvailable = await isTimescaleAvailable(knex);
  if (!timescaleAvailable) {
    console.info(
      "[migration:010] TimescaleDB extension is not available. Primary key was updated so the table is ready once TimescaleDB is installed.",
    );
    return;
  }

  await knex.raw(`CREATE EXTENSION IF NOT EXISTS timescaledb`);

  if (!(await isHypertable(knex))) {
    await knex.raw(`
      SELECT create_hypertable(
        'opcua_data',
        'timestamp',
        if_not_exists => TRUE,
        migrate_data => TRUE
      )
    `);
  }

  try {
    await knex.raw(`
      ALTER TABLE opcua_data
      SET (
        timescaledb.compress,
        timescaledb.compress_orderby = 'timestamp DESC',
        timescaledb.compress_segmentby = 'machine_id, node_key'
      )
    `);

    await knex.raw(`
      SELECT add_compression_policy(
        'opcua_data',
        compress_after => INTERVAL '7 days',
        if_not_exists => TRUE
      )
    `);
  } catch (error) {
    console.warn(
      "[migration:010] Skipping TimescaleDB compression policy setup:",
      error.message,
    );
  }

  try {
    await knex.raw(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS opcua_data_hourly
      WITH (timescaledb.continuous) AS
      SELECT
        time_bucket(INTERVAL '1 hour', "timestamp") AS bucket,
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
        'opcua_data_hourly',
        start_offset => INTERVAL '30 days',
        end_offset => INTERVAL '5 minutes',
        schedule_interval => INTERVAL '5 minutes',
        if_not_exists => TRUE
      )
    `);
  } catch (error) {
    console.warn(
      "[migration:010] Skipping continuous aggregate setup:",
      error.message,
    );
  }
}

export async function down(knex) {
  const timescaleAvailable = await isTimescaleAvailable(knex);

  if (timescaleAvailable) {
    try {
      await knex.raw(`DROP MATERIALIZED VIEW IF EXISTS opcua_data_hourly`);
    } catch (error) {
      console.warn(
        "[migration:010] Failed to drop continuous aggregate during rollback:",
        error.message,
      );
    }

    if (await isHypertable(knex)) {
      console.warn(
        "[migration:010] opcua_data remains a hypertable; skipping rollback to the legacy single-column primary key.",
      );
      return;
    }
  }

  await knex.raw(`
    ALTER TABLE opcua_data
    DROP CONSTRAINT IF EXISTS opcua_data_pkey
  `);

  await knex.raw(`
    ALTER TABLE opcua_data
    ADD CONSTRAINT opcua_data_pkey PRIMARY KEY (id)
  `);
}
