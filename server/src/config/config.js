const Joi = require('joi');
require('dotenv').config();

// Define the schema for environment variables
const envVarsSchema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    PORT: Joi.number().port().default(3000),

    // Client Configuration
    CLIENT_URL: Joi.string().uri().required().description('Frontend application URL'),

    // Database Configuration
    DB_HOST: Joi.string().hostname().required().description('Database host'),
    DB_PORT: Joi.number().port().default(5432).description('Database port'),
    DB_USER: Joi.string().required().description('Database user'),
    DB_PASSWORD: Joi.string().required().description('Database password'), // Secret!
    DB_NAME: Joi.string().required().description('Database name'),
    DB_MAX_POOL: Joi.number().integer().min(1).default(10).description('Database max pool size'),
    DB_CONNECTION_TIMEOUT: Joi.number().integer().min(1000).default(10000).description('Database connection timeout (ms)'),
    DB_IDLE_TIMEOUT: Joi.number().integer().min(1000).default(30000).description('Database idle connection timeout (ms)'),
    DB_HEALTH_CHECK_INTERVAL: Joi.number().integer().min(0).default(60000).description('Database health check interval (ms, 0 to disable)'),

    // OPC UA Configuration
    OPCUA_IP: Joi.string().ip({ version: ['ipv4', 'ipv6'] }).default('localhost').description('OPC UA server IP address'),
    OPCUA_PORT: Joi.number().port().default(4840).description('OPC UA server port'),
    OPCUA_RESOURCE_PATH: Joi.string().default('/UA/MyLittleServer').description('OPC UA resource path'),
    OPCUA_SECURITY_MODE: Joi.string().valid('None', 'Sign', 'SignAndEncrypt').default('None').description('OPC UA security mode'),
    OPCUA_SECURITY_POLICY: Joi.string().default('None').description('OPC UA security policy'), // Consider validating against known policies if strictness needed
    OPCUA_SECURITY_FALLBACK_ENABLED: Joi.boolean().default(false).description('Enable fallback to SecurityMode=None on security errors'),
    OPCUA_PKI_DIR: Joi.string().optional().description('Optional custom path for OPC UA PKI certificates'),
    OPCUA_APPLICATION_NAME: Joi.string().default('NodeOPCUA-Client').description('OPC UA client application name'),
    OPCUA_CERT_ORG_NAME: Joi.string().default('OpenSource').description('Organization name for self-signed cert'),
    OPCUA_CERT_COUNTRY: Joi.string().length(2).default('US').description('Country code (2 letters) for self-signed cert'),
    OPCUA_CERT_LOCALITY: Joi.string().default('Somewhere').description('Locality for self-signed cert'),
    OPCUA_CERT_STATE: Joi.string().default('State').description('State/Province for self-signed cert'),
    COOKIE_SECRET: Joi.string().required().description('Secret used for signing cookies'),
    AUTO_ACCEPT_CERTIFICATES: Joi.boolean().default(false).description('Automatically trust unknown server certificates'),
    OPCUA_HEALTH_CHECK_INTERVAL: Joi.number().integer().min(0).default(30000).description('OPC UA health check interval (ms, 0 to disable)'),

    // Application Configuration
    LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').default('info'),
    ADMIN_API_KEY: Joi.string().optional().description('API key for accessing admin/debug endpoints'), // Secret!
    OPCUA_BATCH_SIZE: Joi.number().integer().min(1).default(100).description('Batch size for OPC UA data inserts'),
    OPCUA_QUEUE_DELAY: Joi.number().integer().min(10).default(500).description('Delay (ms) for queue processing loop'),
    OPCUA_QUEUE_WARN_THRESHOLD: Joi.number().integer().min(100).default(10000).description('Queue size warning threshold'),
    MAX_QUEUE_SIZE: Joi.number().integer().min(1000).default(100000).description('Maximum OPC UA data queue size'),

    // Security
    RATE_LIMIT_WINDOW_MS: Joi.number().integer().default(15 * 60 * 1000).description('Rate limit window (ms)'),
    RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().default(1000).description('Max requests per window for rate limit'),
    // Add JWT_SECRET, SESSION_SECRET etc. if using authentication

})
    .unknown(true); // Allow other env variables not defined in the schema

const { value: envVars, error } = envVarsSchema
    .prefs({ errors: { label: 'key' } })
    .validate(process.env);

if (error) {
    throw new Error(`❌ Environment variable validation error: ${error.message}`);
}

// Log loaded configuration (excluding secrets)
const nonSecrets = { ...envVars };
delete nonSecrets.DB_PASSWORD;
delete nonSecrets.ADMIN_API_KEY;
delete nonSecrets.COOKIE_SECRET;

// Delete other secrets like JWT_SECRET if added
console.log("🔧 Loaded configuration (excluding secrets):", nonSecrets);
console.warn("🔑 Ensure sensitive variables (DB_PASSWORD, ADMIN_API_KEY, etc.) are set securely via environment variables or a secrets manager, NOT hardcoded or in committed .env files.");

// Export the validated and coerced configuration object
module.exports = envVars;

// Re-export MAX_QUEUE_SIZE for queue.js
module.exports.MAX_QUEUE_SIZE = envVars.MAX_QUEUE_SIZE;