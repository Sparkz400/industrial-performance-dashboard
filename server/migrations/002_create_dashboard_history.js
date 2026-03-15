/**
 * Create the dashboard_history table.
 * Tracks create/update/delete actions on dashboards for auditing purposes.
 */
export async function up(knex) {
  await knex.schema.createTable('dashboard_history', (table) => {
    table.increments('id').primary();
    table.string('dashboard_id').notNullable();
    table.string('action').notNullable();
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    table.string('user_id').nullable();

    table.index('dashboard_id');
    table.index('timestamp');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('dashboard_history');
}
