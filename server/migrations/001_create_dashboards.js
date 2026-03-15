/**
 * Create the dashboards table.
 * Stores dashboard configurations including widget definitions and layout positions.
 */
export async function up(knex) {
  await knex.schema.createTable('dashboards', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
    table.jsonb('widgets').defaultTo('[]');
    table.jsonb('layout').defaultTo('[]');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('dashboards');
}
