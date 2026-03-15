import swaggerJsdoc from "swagger-jsdoc";

const swaggerDefinition = {
  openapi: "3.0.3",
  info: {
    title: "Performance Dashboard API",
    version: "1.0.0",
    description:
      "REST API for the Performance Dashboard application. Provides endpoints for dashboard management, OPC UA connectivity, certificate management, system monitoring, and real-time data retrieval.",
    contact: {
      name: "Performance Dashboard Team",
    },
    license: {
      name: "ISC",
    },
  },
  servers: [
    {
      url: "/api/v1",
      description: "API v1 base path",
    },
    {
      url: "/api",
      description: "Unversioned base path (for csrf-token)",
    },
  ],
  tags: [
    { name: "Dashboards", description: "Dashboard CRUD operations" },
    { name: "OPC UA", description: "OPC UA connection management" },
    { name: "Certificates", description: "OPC UA certificate management" },
    { name: "System", description: "System statistics and connections" },
    { name: "Status", description: "Service health and status" },
    { name: "Database", description: "Database connectivity" },
    { name: "Security", description: "CSRF token management" },
    { name: "Data", description: "OPC UA historical data queries" },
  ],
  components: {
    schemas: {
      Dashboard: {
        type: "object",
        properties: {
          id: { type: "string", example: "dashboard-default-1700000000000" },
          name: { type: "string", example: "Default Dashboard" },
          widgets: {
            type: "array",
            items: { type: "object" },
            description: "Array of widget configuration objects",
          },
          layout: {
            type: "array",
            items: { type: "object" },
            description: "Array of layout position objects",
          },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      DashboardInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", example: "My Dashboard" },
          widgets: {
            type: "array",
            items: { type: "object" },
            default: [],
          },
          layout: {
            type: "array",
            items: { type: "object" },
            default: [],
          },
        },
      },
      SystemStats: {
        type: "object",
        properties: {
          uptime: { type: "integer", description: "Server uptime in seconds" },
          memoryUsage: {
            type: "object",
            properties: {
              total: { type: "integer", description: "Total memory in MB" },
              used: { type: "integer", description: "Used memory in MB" },
              free: { type: "integer", description: "Free memory in MB" },
              percentUsed: {
                type: "integer",
                description: "Percentage of memory used",
              },
            },
          },
          cpuUsage: { type: "integer", description: "CPU usage percentage" },
          cpuInfo: {
            type: "object",
            properties: {
              cores: { type: "integer" },
              model: { type: "string" },
              speed: { type: "integer" },
            },
          },
          platform: {
            type: "object",
            properties: {
              type: { type: "string" },
              platform: { type: "string" },
              release: { type: "string" },
              architecture: { type: "string" },
            },
          },
          processMemory: {
            type: "object",
            properties: {
              rss: { type: "integer" },
              heapTotal: { type: "integer" },
              heapUsed: { type: "integer" },
              external: { type: "integer" },
            },
          },
          activeConnections: { type: "integer" },
          lastRestart: { type: "string", format: "date-time" },
        },
      },
      ConnectionStats: {
        type: "object",
        properties: {
          activeCount: { type: "integer" },
          activeConnections: {
            type: "array",
            items: { type: "object" },
          },
          history: {
            type: "array",
            items: { type: "object" },
          },
        },
      },
      OpcuaStatus: {
        type: "object",
        properties: {
          connected: { type: "boolean" },
          status: { type: "string" },
          statusText: { type: "string" },
          config: {
            type: "object",
            properties: {
              ip: { type: "string" },
              port: { type: "integer" },
              resourcePath: { type: "string" },
              securityMode: {
                type: "string",
                enum: ["None", "Sign", "SignAndEncrypt"],
              },
              securityPolicy: { type: "string" },
            },
          },
          details: { type: "object" },
          lastUpdated: { type: "string", format: "date-time" },
        },
      },
      OpcuaConnectionInput: {
        type: "object",
        required: ["ip", "port"],
        properties: {
          ip: { type: "string", example: "localhost" },
          port: { type: "integer", example: 4840 },
          resourcePath: { type: "string", default: "" },
          securityMode: {
            type: "string",
            enum: ["None", "Sign", "SignAndEncrypt"],
            default: "None",
          },
          securityPolicy: { type: "string", default: "None" },
        },
      },
      SecurityOptions: {
        type: "object",
        properties: {
          securityModes: {
            type: "array",
            items: { type: "string" },
          },
          securityPolicies: {
            type: "array",
            items: { type: "string" },
          },
          current: {
            type: "object",
            properties: {
              securityMode: { type: "string" },
              securityPolicy: { type: "string" },
              ip: { type: "string" },
              port: { type: "integer" },
              resourcePath: { type: "string" },
            },
          },
        },
      },
      Certificate: {
        type: "object",
        properties: {
          filename: { type: "string" },
          subject: { type: "string" },
          issuer: { type: "string" },
          validFrom: { type: "string", format: "date-time" },
          validTo: { type: "string", format: "date-time" },
        },
      },
      ClientCertificate: {
        type: "object",
        properties: {
          certificate: {
            type: "string",
            description: "PEM-encoded certificate",
          },
          certificatePath: { type: "string" },
          privateKeyPath: { type: "string" },
          hasPrivateKey: { type: "boolean" },
        },
      },
      HealthStatus: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok", "error"] },
          timestamp: { type: "string", format: "date-time" },
          message: { type: "string" },
          statusText: { type: "string" },
        },
      },
      FullStatus: {
        type: "object",
        description: "Full status of all services (database, OPC UA, etc.)",
        additionalProperties: true,
      },
      CsrfToken: {
        type: "object",
        properties: {
          csrfToken: { type: "string" },
        },
      },
      OperationModeDataPoint: {
        type: "object",
        properties: {
          timestamp: { type: "string", format: "date-time" },
          time: { type: "string", example: "14:30:05" },
          mode: { type: "number" },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" },
          details: { type: "string" },
        },
      },
    },
    parameters: {
      DashboardId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", minLength: 3, maxLength: 100 },
        description: "Dashboard identifier",
      },
      CertificateFilename: {
        name: "filename",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: "Certificate filename",
      },
    },
  },
  paths: {
    // --- Dashboards ---
    "/dashboards": {
      get: {
        tags: ["Dashboards"],
        summary: "List all dashboards",
        description:
          "Returns all dashboards ordered by name. Creates a default dashboard if none exist.",
        responses: {
          200: {
            description: "Array of dashboards",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Dashboard" },
                },
              },
            },
          },
          500: {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/dashboards/import": {
      post: {
        tags: ["Dashboards"],
        summary: "Import a dashboard",
        description:
          "Creates a new dashboard from an imported JSON configuration with an auto-generated ID.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DashboardInput" },
            },
          },
        },
        responses: {
          201: {
            description: "Imported dashboard",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dashboard" },
              },
            },
          },
          400: {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/dashboards/{id}": {
      get: {
        tags: ["Dashboards"],
        summary: "Get a dashboard by ID",
        parameters: [{ $ref: "#/components/parameters/DashboardId" }],
        responses: {
          200: {
            description: "Dashboard object",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dashboard" },
              },
            },
          },
          404: {
            description: "Dashboard not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
      post: {
        tags: ["Dashboards"],
        summary: "Create or update a dashboard",
        description:
          "Upserts a dashboard by ID. Also records an entry in dashboard_history.",
        parameters: [{ $ref: "#/components/parameters/DashboardId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/DashboardInput" },
            },
          },
        },
        responses: {
          200: {
            description: "Saved dashboard",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Dashboard" },
              },
            },
          },
          400: {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          409: {
            description: "Conflict (duplicate ID)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          503: {
            description: "Database unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Dashboards"],
        summary: "Delete a dashboard",
        parameters: [{ $ref: "#/components/parameters/DashboardId" }],
        responses: {
          200: {
            description: "Deletion confirmation",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example: "Dashboard deleted successfully",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // --- System ---
    "/system/stats": {
      get: {
        tags: ["System"],
        summary: "Get system statistics",
        description:
          "Returns server uptime, memory usage, CPU usage, platform info, process memory, and active WebSocket connections.",
        responses: {
          200: {
            description: "System statistics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SystemStats" },
              },
            },
          },
          500: {
            description: "Error retrieving stats",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/system/connections": {
      get: {
        tags: ["System"],
        summary: "Get WebSocket connection statistics",
        description:
          "Returns active connection count, connected clients, and connection history.",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", default: 20 },
            description: "Maximum number of history entries to return",
          },
        ],
        responses: {
          200: {
            description: "Connection statistics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ConnectionStats" },
              },
            },
          },
        },
      },
    },

    // --- Status ---
    "/status": {
      get: {
        tags: ["Status"],
        summary: "Get full service status",
        description:
          "Returns the status of all monitored services (database, OPC UA, etc.).",
        responses: {
          200: {
            description: "Full status object",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FullStatus" },
              },
            },
          },
        },
      },
    },
    "/status/health": {
      get: {
        tags: ["Status"],
        summary: "Health check",
        description: "Returns 200 if the service is healthy, 503 if it is not.",
        responses: {
          200: {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthStatus" },
              },
            },
          },
          503: {
            description: "Service is unhealthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthStatus" },
              },
            },
          },
        },
      },
    },
    "/status/debug": {
      get: {
        tags: ["Status"],
        summary: "Debug information (admin only)",
        description:
          "Returns detailed diagnostic data including OPC UA connection info and system metrics. Requires x-api-key header matching ADMIN_API_KEY.",
        parameters: [
          {
            name: "x-api-key",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Admin API key",
          },
        ],
        responses: {
          200: {
            description: "Diagnostic data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: true,
                },
              },
            },
          },
          403: {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },

    // --- Database ---
    "/db/test": {
      get: {
        tags: ["Database"],
        summary: "Test database connectivity",
        description:
          "Runs a simple SELECT NOW() query to verify the database connection is alive.",
        responses: {
          200: {
            description: "Database is reachable",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    time: { type: "object" },
                  },
                },
              },
            },
          },
          500: {
            description: "Database error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },

    // --- OPC UA ---
    "/opcua/status": {
      get: {
        tags: ["OPC UA"],
        summary: "Get OPC UA connection status",
        responses: {
          200: {
            description: "Current OPC UA connection status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OpcuaStatus" },
              },
            },
          },
        },
      },
    },
    "/opcua/connect": {
      post: {
        tags: ["OPC UA"],
        summary: "Connect to an OPC UA server",
        description:
          "Reinitializes the OPC UA connection with the provided configuration.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OpcuaConnectionInput" },
            },
          },
        },
        responses: {
          200: {
            description: "Connection reinitialized",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    config: { type: "object" },
                    securityMode: { type: "string" },
                    securityPolicy: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Connection failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/opcua/disconnect": {
      post: {
        tags: ["OPC UA"],
        summary: "Disconnect from OPC UA server",
        responses: {
          200: {
            description: "Disconnected successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example: "OPC UA connection disconnected",
                    },
                  },
                },
              },
            },
          },
          500: {
            description: "Disconnect error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/opcua/security-options": {
      get: {
        tags: ["OPC UA"],
        summary: "Get available OPC UA security options",
        description:
          "Returns lists of supported security modes, policies, and the current configuration.",
        responses: {
          200: {
            description: "Security options",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SecurityOptions" },
              },
            },
          },
        },
      },
    },
    "/opcua/accept-certificate/{filename}": {
      post: {
        tags: ["OPC UA"],
        summary: "Accept an untrusted certificate",
        description:
          "Accepts an untrusted server certificate and triggers a reconnection attempt.",
        parameters: [{ $ref: "#/components/parameters/CertificateFilename" }],
        responses: {
          200: {
            description: "Certificate accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          400: {
            description: "Missing filename",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          500: {
            description: "Failed to accept certificate",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/opcua/test-connection": {
      post: {
        tags: ["OPC UA"],
        summary: "Test an OPC UA connection",
        description:
          "Attempts a temporary connection to the specified OPC UA server to verify reachability. Times out after 10 seconds.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OpcuaConnectionInput" },
            },
          },
        },
        responses: {
          200: {
            description: "Connection test successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    message: { type: "string" },
                    securityMode: { type: "string" },
                    securityPolicy: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Connection test failed",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: false },
                    error: { type: "string" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // --- Certificates ---
    "/certificates/trusted": {
      get: {
        tags: ["Certificates"],
        summary: "List trusted certificates",
        responses: {
          200: {
            description: "Array of trusted certificates",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Certificate" },
                },
              },
            },
          },
          500: {
            description: "Error retrieving certificates",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/certificates/rejected": {
      get: {
        tags: ["Certificates"],
        summary: "List rejected certificates",
        responses: {
          200: {
            description: "Array of rejected certificates",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Certificate" },
                },
              },
            },
          },
        },
      },
    },
    "/certificates/trust": {
      post: {
        tags: ["Certificates"],
        summary: "Trust a certificate",
        description:
          "Imports a base64-encoded certificate into the trusted store.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["certificate", "name"],
                properties: {
                  certificate: {
                    type: "string",
                    description: "Base64-encoded certificate",
                  },
                  name: {
                    type: "string",
                    description: "Certificate name/label",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Certificate trusted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    filepath: { type: "string" },
                  },
                },
              },
            },
          },
          400: {
            description: "Missing certificate or name",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/certificates/accept-rejected/{filename}": {
      post: {
        tags: ["Certificates"],
        summary: "Accept a rejected certificate",
        description:
          "Moves a certificate from the rejected store to the trusted store.",
        parameters: [{ $ref: "#/components/parameters/CertificateFilename" }],
        responses: {
          200: {
            description: "Certificate accepted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string" },
                    filepath: { type: "string" },
                  },
                },
              },
            },
          },
          400: {
            description: "Missing filename",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/certificates/regenerate": {
      post: {
        tags: ["Certificates"],
        summary: "Regenerate client certificate",
        description:
          "Creates a new self-signed client certificate and private key.",
        responses: {
          200: {
            description: "Certificate regenerated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: {
                      type: "string",
                      example: "Client certificate regenerated successfully",
                    },
                  },
                },
              },
            },
          },
          500: {
            description: "Regeneration failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/certificates/client": {
      get: {
        tags: ["Certificates"],
        summary: "Get client certificate",
        description:
          "Returns the PEM-encoded client certificate and file paths.",
        responses: {
          200: {
            description: "Client certificate info",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ClientCertificate" },
              },
            },
          },
          404: {
            description: "Certificate not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
    "/certificates/security-options": {
      get: {
        tags: ["Certificates"],
        summary: "Get security options (via certificates route)",
        description:
          "Returns supported security modes and policies with current settings.",
        responses: {
          200: {
            description: "Security options",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SecurityOptions" },
              },
            },
          },
        },
      },
    },

    // --- CSRF ---
    "/csrf-token": {
      get: {
        tags: ["Security"],
        summary: "Get CSRF token",
        description:
          "Returns a CSRF token for the current session. Must be included in the x-csrf-token header for all mutating requests.",
        responses: {
          200: {
            description: "CSRF token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CsrfToken" },
              },
            },
          },
        },
      },
    },

    // --- Operation Mode Data ---
    "/operation-mode-data": {
      get: {
        tags: ["Data"],
        summary: "Get operation mode data",
        description:
          "Returns timestamped operation mode values from the opcua_data table, filtered by optional date range.",
        parameters: [
          {
            name: "limit",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 5000,
              default: 1000,
            },
            description: "Maximum number of data points to return",
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", minimum: 0, default: 0 },
            description: "Number of data points to skip",
          },
          {
            name: "startDate",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "Start of date range (ISO 8601)",
          },
          {
            name: "endDate",
            in: "query",
            schema: { type: "string", format: "date-time" },
            description: "End of date range (ISO 8601)",
          },
        ],
        responses: {
          200: {
            description: "Array of operation mode data points",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/OperationModeDataPoint",
                  },
                },
              },
            },
          },
          500: {
            description: "Query error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        },
      },
    },
  },
};

const options = {
  swaggerDefinition,
  // No JSDoc annotations to scan -- spec is fully inline above
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
