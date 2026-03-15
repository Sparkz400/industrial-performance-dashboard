/**
 * Add machine_id column to opcua_data table for multi-machine support.
 * Nullable for backwards compatibility with existing data.
 */
export async function up(knex) {
  await knex.schema.alterTable('opcua_data', (table) => {
    table.integer('machine_id').unsigned().nullable()
      .references('id').inTable('machines').onDelete('SET NULL');
    table.index(['machine_id', 'node_key', 'timestamp'], 'idx_opcua_data_machine_node_timestamp');
  });
}

export async function down(knex) {
  await knex.schema.alterTable('opcua_data', (table) => {
    table.dropIndex([], 'idx_opcua_data_machine_node_timestamp');
    table.dropColumn('machine_id');
  });
}
