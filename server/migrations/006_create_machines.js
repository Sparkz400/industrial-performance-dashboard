/**
 * Create the machines table.
 * Stores OPC-UA server/machine configurations for multi-machine support.
 */
export async function up(knex) {
  await knex.schema.createTable('machines', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('endpoint_url').notNullable().unique();
    table.string('ip').notNullable();
    table.integer('port').notNullable().defaultTo(4840);
    table.string('resource_path').defaultTo('');
    table.string('security_mode').defaultTo('None');
    table.string('security_policy').defaultTo('None');
    table.boolean('is_active').defaultTo(true);
    table.string('status').defaultTo('disconnected');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('machines');
}
