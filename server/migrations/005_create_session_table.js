/**
 * Create the session table for connect-pg-simple.
 * Stores Express session data in PostgreSQL.
 * Schema matches the connect-pg-simple expected format.
 */
export async function up(knex) {
  await knex.schema.createTable('session', (table) => {
    table.string('sid').primary();
    table.jsonb('sess').notNullable();
    table.timestamp('expire', { precision: 6 }).notNullable();

    table.index('expire', 'idx_session_expire');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('session');
}
