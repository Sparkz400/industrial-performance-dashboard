/**
 * Create the opcua_data_dlq (Dead-Letter Queue) table.
 * Stores batches of OPC UA data that failed to insert, along with the error message,
 * so they can be investigated and replayed later.
 */
export async function up(knex) {
  await knex.schema.createTable('opcua_data_dlq', (table) => {
    table.increments('id').primary();
    table.text('error_message').notNullable();
    table.jsonb('batch_data').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('opcua_data_dlq');
}
