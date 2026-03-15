/**
 * Create the opcua_data table.
 * Stores time-series data received from OPC UA node subscriptions.
 * Includes a composite index on (node_key, timestamp) for efficient range queries.
 */
export async function up(knex) {
  await knex.schema.createTable('opcua_data', (table) => {
    table.increments('id').primary();
    table.string('node_key').notNullable();
    table.string('node_label').nullable();
    table.timestamp('timestamp', { useTz: true }).notNullable();
    table.float('value').nullable();

    table.index(['node_key', 'timestamp'], 'idx_opcua_data_node_key_timestamp');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('opcua_data');
}
