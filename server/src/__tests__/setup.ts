/**
 * Vitest setup file for server tests.
 * Sets required environment variables before any module imports.
 */
process.env.NODE_ENV = "test";
process.env.PORT = "3099";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "5432";
process.env.DB_USER = "test";
process.env.DB_PASSWORD = "test";
process.env.DB_NAME = "test_db";
process.env.COOKIE_SECRET = "test-cookie-secret";
process.env.SESSION_SECRET = "test-session-secret";
process.env.OPCUA_IP = "localhost";
process.env.OPCUA_PORT = "4840";
process.env.ADMIN_API_KEY = "test-admin-key";
