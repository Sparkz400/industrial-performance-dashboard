/**
 * Create the node_mappings table.
 * Stores OPC-UA node-to-widget mappings per machine.
 */
export async function up(knex) {
  await knex.schema.createTable('node_mappings', (table) => {
    table.increments('id').primary();
    table.integer('machine_id').unsigned().notNullable()
      .references('id').inTable('machines').onDelete('CASCADE');
    table.string('node_id').notNullable();
    table.string('node_key').notNullable();
    table.string('display_name').notNullable();
    table.string('data_type').defaultTo('Double');
    table.integer('sampling_interval').defaultTo(500);
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());

    table.unique(['machine_id', 'node_id']);
    table.index(['machine_id', 'is_active']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('node_mappings');
}
