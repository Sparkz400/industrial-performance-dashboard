import Joi from "joi";
import "dotenv/config";

// Define the schema for environment variables
const envVarsSchema = Joi.object({
  RECOVERY_MODE: Joi.boolean().default(false),
  ENABLE_LEGACY_GATEWAY: Joi.boolean().default(false),
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().default("127.0.0.1"),

  // Client Configuration
  CLIENT_URL: Joi.string()
    .uri()
    .required()
    .description("Frontend application URL"),

  // Database Configuration
  DB_HOST: Joi.string().hostname().required().description("Database host"),
  DB_PORT: Joi.number().port().default(5432).description("Database port"),
  DB_USER: Joi.string().required().description("Database user"),
  DB_PASSWORD: Joi.string().required().description("Database password"),
  DB_NAME: Joi.string().required().description("Database name"),
  DB_READ_REPLICA_URLS: Joi.string()
    .allow("")
    .default("")
    .description("Comma-separated PostgreSQL replica connection URLs"),
  REDIS_URL: Joi.string()
    .uri()
    .optional()
    .description("Optional Redis connection URL"),
  DB_MAX_POOL: Joi.number()
    .integer()
    .min(1)
    .default(10)
    .description("Database max pool size"),
  DB_CONNECTION_TIMEOUT: Joi.number()
    .integer()
    .min(1000)
    .default(10000)
    .description("Database connection timeout (ms)"),
  DB_IDLE_TIMEOUT: Joi.number()
    .integer()
    .min(1000)
    .default(30000)
    .description("Database idle connection timeout (ms)"),
  DB_HEALTH_CHECK_INTERVAL: Joi.number()
    .integer()
    .min(0)
    .default(60000)
    .description("Database health check interval (ms, 0 to disable)"),
  DB_REPLICA_MAX_POOL: Joi.number()
    .integer()
    .min(1)
    .default(10)
    .description("Replica pool size for read-only database traffic"),
  DB_QUERY_SLOW_THRESHOLD_MS: Joi.number()
    .integer()
    .min(1)
    .default(250)
    .description("Threshold for slow query monitoring (ms)"),
  DB_QUERY_METRICS_MAX_SAMPLES: Joi.number()
    .integer()
    .min(10)
    .default(250)
    .description("Number of recent query samples retained in memory"),

  // OPC UA Configuration
  OPCUA_IP: Joi.string()
    .default("localhost")
    .description("OPC UA server host/IP"),
  OPCUA_PORT: Joi.number()
    .port()
    .default(4840)
    .description("OPC UA server port"),
  OPCUA_RESOURCE_PATH: Joi.string()
    .allow("")
    .default("")
    .description("OPC UA resource path (kann leer sein)"),

  OPCUA_SECURITY_MODE: Joi.string()
    .valid("None", "Sign", "SignAndEncrypt")
    .default("None")
    .description("OPC UA security mode"),
  OPCUA_SECURITY_POLICY: Joi.string()
    .default("None")
    .description("OPC UA security policy"),
  OPCUA_SECURITY_FALLBACK_ENABLED: Joi.boolean()
    .valid(false)
    .default(false)
    .description("Deprecated; security fallback is disabled"),
  OPCUA_PKI_DIR: Joi.string()
    .optional()
    .description("Optional custom path for OPC UA PKI certificates"),
  OPCUA_APPLICATION_NAME: Joi.string()
    .default("NodeOPCUA-Client")
    .description("OPC UA client application name"),
  OPCUA_CERT_ORG_NAME: Joi.string()
    .default("OpenSource")
    .description("Organization name for self-signed cert"),
  OPCUA_CERT_COUNTRY: Joi.string()
    .length(2)
    .default("US")
    .description("Country code (2 letters) for self-signed cert"),
  OPCUA_CERT_LOCALITY: Joi.string()
    .default("Somewhere")
    .description("Locality for self-signed cert"),
  OPCUA_CERT_STATE: Joi.string()
    .default("State")
    .description("State/Province for self-signed cert"),
  COOKIE_SECRET: Joi.string()
    .required()
    .description("Secret used for signing cookies"),
  SESSION_SECRET: Joi.string()
    .required()
    .description("Secret used for signing sessions"),
  AUTO_ACCEPT_CERTIFICATES: Joi.boolean()
    .valid(false)
    .default(false)
    .description(
      "Deprecated; unknown server certificates require explicit trust",
    ),
  OPCUA_HEALTH_CHECK_INTERVAL: Joi.number()
    .integer()
    .min(0)
    .default(30000)
    .description("OPC UA health check interval (ms, 0 to disable)"),

  // Application Configuration
  OPCUA_SPOOL_PATH: Joi.string().default("data/measurements.sqlite"),
  OPCUA_SPOOL_MAX_ENTRIES: Joi.number()
    .integer()
    .min(1000)
    .default(1_000_000)
    .description("Pending measurements at which acquisition stops"),
  OPCUA_SPOOL_RESERVE_MB: Joi.number()
    .integer()
    .min(16)
    .default(64)
    .description("Free disk space (MiB) kept beside the spool"),
  COLLECTOR_BACKLOG_ALERT_SECONDS: Joi.number()
    .integer()
    .min(10)
    .default(60)
    .description("Oldest pending measurement age that raises a backlog alert"),
  STORAGE_RUNWAY_ALERT_DAYS: Joi.number()
    .min(0.5)
    .default(2)
    .description("Projected days to the disk reserve that raise an alert"),
  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "http", "verbose", "debug", "silly")
    .default("info"),
  ADMIN_API_KEY: Joi.string()
    .optional()
    .description("API key for accessing admin/debug endpoints"),
  // E02: single sign-on is off unless an issuer is configured.
  OIDC_ISSUER: Joi.string()
    .uri({ scheme: ["https"] })
    .optional(),
  OIDC_CLIENT_ID: Joi.string().when("OIDC_ISSUER", {
    is: Joi.exist(),
    then: Joi.required(),
  }),
  OIDC_CLIENT_SECRET: Joi.string().when("OIDC_ISSUER", {
    is: Joi.exist(),
    then: Joi.required(),
  }),
  OIDC_REDIRECT_URI: Joi.string().uri().when("OIDC_ISSUER", {
    is: Joi.exist(),
    then: Joi.required(),
  }),
  OIDC_CA_FILE: Joi.string().optional(),
  OIDC_SCOPES: Joi.string().default("openid profile email groups"),
  OIDC_GROUPS_CLAIM: Joi.string().default("groups"),
  OIDC_DISPLAY_NAME: Joi.string().max(60).default("Single sign-on"),
  OIDC_MAX_SESSION_HOURS: Joi.number().min(1).max(24).default(8),
  LOCAL_RECOVERY_ACCOUNTS: Joi.string().allow("").default(""),
  OPCUA_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .default(100)
    .description("Batch size for OPC UA data inserts"),
  OPCUA_QUEUE_DELAY: Joi.number()
    .integer()
    .min(10)
    .default(500)
    .description("Delay (ms) for queue processing loop"),
  OPCUA_QUEUE_WARN_THRESHOLD: Joi.number()
    .integer()
    .min(100)
    .default(10000)
    .description("Queue size warning threshold"),
  MAX_QUEUE_SIZE: Joi.number()
    .integer()
    .min(1000)
    .default(100000)
    .description("Maximum OPC UA data queue size"),

  // Security
  RATE_LIMIT_WINDOW_MS: Joi.number()
    .integer()
    .default(15 * 60 * 1000)
    .description("Rate limit window (ms)"),
  RATE_LIMIT_MAX_REQUESTS: Joi.number()
    .integer()
    .default(1000)
    .description("Max requests per window for rate limit"),

  // Webhooks
  WEBHOOK_SIGNING_SECRET: Joi.string()
    .default("whsec_default_change_me")
    .description("Default secret for webhook HMAC signing"),
  ALLOW_PRIVATE_OUTBOUND_URLS: Joi.boolean()
    .default(false)
    .description(
      "Allow outbound HTTP(S) requests to localhost/private network hosts",
    ),
  REPORT_RETENTION_DAYS: Joi.number()
    .integer()
    .min(1)
    .optional()
    .description(
      "Delete stored report PDFs older than this many days; unset keeps them",
    ),

  // Compliance
  COMPLIANCE_MODE_ENABLED: Joi.boolean()
    .default(false)
    .description(
      "Enable recipe/batch and audit features (not a validated regulatory mode)",
    ),

  // Edge Gateway
  EDGE_MODE_ENABLED: Joi.boolean()
    .default(false)
    .description("Enable edge gateway mode"),
  EDGE_CLOUD_URL: Joi.string()
    .uri()
    .allow("")
    .default("")
    .description("Cloud server URL for edge sync"),
  EDGE_SYNC_INTERVAL_MS: Joi.number()
    .integer()
    .min(1000)
    .default(30000)
    .description("Edge sync interval (ms)"),
  // H08: an edge ships rows only up to an id recorded this long ago (longest open write).
  EDGE_SETTLE_MS: Joi.number().integer().min(1000).max(600000).default(30000),
  EDGE_SYNC_BATCH_SIZE: Joi.number()
    .integer()
    .min(10)
    .default(500)
    .description("Edge sync batch size"),
  EDGE_DATA_RETENTION_DAYS: Joi.number()
    .integer()
    .min(1)
    .default(7)
    .description("Edge data retention (days)"),
  EDGE_LIGHTWEIGHT_MODE: Joi.boolean()
    .default(false)
    .description(
      "Enable lightweight mode for resource-constrained edge devices",
    ),

  // Observability
  OTEL_ENABLED: Joi.boolean()
    .default(false)
    .description("Enable OpenTelemetry tracing"),
  OTEL_EXPORTER_OTLP_ENDPOINT: Joi.string()
    .uri()
    .default("http://localhost:4318")
    .description("OTLP exporter endpoint for traces"),
  OTEL_SERVICE_NAME: Joi.string()
    .default("performance-dashboard-server")
    .description("Service name for OpenTelemetry"),

  // SMTP / Email
  SMTP_HOST: Joi.string()
    .empty("")
    .optional()
    .description("SMTP server host for email delivery"),
  SMTP_PORT: Joi.alternatives()
    .try(Joi.number().port(), Joi.string())
    .optional()
    .description("SMTP server port"),
  SMTP_USER: Joi.string()
    .empty("")
    .optional()
    .description("SMTP authentication user"),
  SMTP_PASS: Joi.string()
    .empty("")
    .optional()
    .description("SMTP authentication password"),
  SMTP_FROM: Joi.string()
    .empty("")
    .optional()
    .description("Sender address for outgoing emails"),
}).unknown(true);

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" }, abortEarly: false })
  .validate(process.env);

if (error) {
  const details = error.details
    .map((d) => `  - ${d.context?.key ?? d.path.join(".")}: ${d.message}`)
    .join("\n");
  throw new Error(
    `\n\nEnvironment configuration failed — fix the following and restart:\n\n${details}\n\nSee .env.example for reference values.\n`,
  );
}

export interface AppConfig {
  NODE_ENV: string;
  PORT: number;
  HOST: string;
  CLIENT_URL: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_READ_REPLICA_URLS: string;
  REDIS_URL?: string;
  DB_MAX_POOL: number;
  DB_CONNECTION_TIMEOUT: number;
  DB_IDLE_TIMEOUT: number;
  DB_HEALTH_CHECK_INTERVAL: number;
  DB_REPLICA_MAX_POOL: number;
  DB_QUERY_SLOW_THRESHOLD_MS: number;
  DB_QUERY_METRICS_MAX_SAMPLES: number;
  OPCUA_IP: string;
  OPCUA_PORT: number;
  OPCUA_RESOURCE_PATH: string;
  OPCUA_SECURITY_MODE: string;
  OPCUA_SECURITY_POLICY: string;
  OPCUA_SECURITY_FALLBACK_ENABLED: boolean;
  OPCUA_PKI_DIR?: string;
  OPCUA_APPLICATION_NAME: string;
  OPCUA_CERT_ORG_NAME: string;
  OPCUA_CERT_COUNTRY: string;
  OPCUA_CERT_LOCALITY: string;
  OPCUA_CERT_STATE: string;
  COOKIE_SECRET: string;
  AUTO_ACCEPT_CERTIFICATES: boolean;
  RECOVERY_MODE: boolean;
  ENABLE_LEGACY_GATEWAY: boolean;
  OPCUA_HEALTH_CHECK_INTERVAL: number;
  LOG_LEVEL: string;
  ADMIN_API_KEY?: string;
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  OIDC_CA_FILE?: string;
  OIDC_SCOPES: string;
  OIDC_GROUPS_CLAIM: string;
  OIDC_DISPLAY_NAME: string;
  OIDC_MAX_SESSION_HOURS: number;
  LOCAL_RECOVERY_ACCOUNTS: string;
  OPCUA_BATCH_SIZE: number;
  OPCUA_SPOOL_PATH: string;
  OPCUA_SPOOL_MAX_ENTRIES: number;
  OPCUA_SPOOL_RESERVE_MB: number;
  COLLECTOR_BACKLOG_ALERT_SECONDS: number;
  STORAGE_RUNWAY_ALERT_DAYS: number;
  OPCUA_QUEUE_DELAY: number;
  OPCUA_QUEUE_WARN_THRESHOLD: number;
  MAX_QUEUE_SIZE: number;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  SESSION_SECRET: string;
  COMPLIANCE_MODE_ENABLED: boolean;
  EDGE_MODE_ENABLED: boolean;
  EDGE_CLOUD_URL: string;
  EDGE_SYNC_INTERVAL_MS: number;
  EDGE_SYNC_BATCH_SIZE: number;
  EDGE_SETTLE_MS: number;
  EDGE_DATA_RETENTION_DAYS: number;
  EDGE_LIGHTWEIGHT_MODE: boolean;
  OTEL_ENABLED: boolean;
  OTEL_EXPORTER_OTLP_ENDPOINT: string;
  OTEL_SERVICE_NAME: string;
  WEBHOOK_SIGNING_SECRET: string;
  ALLOW_PRIVATE_OUTBOUND_URLS: boolean;
  REPORT_RETENTION_DAYS?: number;
  SMTP_HOST?: string;
  SMTP_PORT?: number | string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
}

// Export the validated and coerced configuration object
const config: AppConfig = envVars as AppConfig;
export default config;

// Re-export MAX_QUEUE_SIZE for queue.ts
export const MAX_QUEUE_SIZE: number = (envVars as AppConfig).MAX_QUEUE_SIZE;
