const { Client } = require('pg');
const status = require('../utils/status');

const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'root',
    database: 'postgres'
});

client.connect()
    .then(() => {
        console.log('Connected to PostgreSQL');
        status.setDatabaseStatus("connected");
    })
    .catch(err => {
        console.error('PostgreSQL connection error:', err.stack);
        status.setDatabaseStatus("error");
    });


module.exports = client;
