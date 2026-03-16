import client from "prom-client";
import type { Request, Response, NextFunction } from "express";
import statusManager from "../utils/status.js";
import StatusConstants from "../utils/statusConstants.js";

// Create a custom registry so we don't pollute the global one
export const metricsRegistry = new client.Registry();

// Collect default Node.js metrics (event loop, heap, GC, etc.)
client.collectDefaultMetrics({ register: metricsRegistry });

// --- HTTP request metrics ---

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [metricsRegistry],
});

export const httpRequestsInFlight = new client.Gauge({
  name: "http_requests_in_flight",
  help: "Number of HTTP requests currently being processed",
  registers: [metricsRegistry],
});

// --- WebSocket metrics ---

export const websocketConnectionsActive = new client.Gauge({
  name: "websocket_connections_active",
  help: "Number of active WebSocket connections",
  registers: [metricsRegistry],
});

// --- OPC UA metrics ---

export const opcuaConnectionStatus = new client.Gauge({
  name: "opcua_connection_status",
  help: "OPC UA connection status (1=connected, 0=disconnected)",
  labelNames: ["machine_id"] as const,
  registers: [metricsRegistry],
});

export const opcuaDataPointsReceived = new client.Counter({
  name: "opcua_data_points_received_total",
  help: "Total OPC UA data points received",
  labelNames: ["machine_id"] as const,
  registers: [metricsRegistry],
});

export const opcuaQueueSize = new client.Gauge({
  name: "opcua_queue_size",
  help: "Current OPC UA data queue size",
  registers: [metricsRegistry],
});

// --- Database metrics ---

export const dbPoolTotal = new client.Gauge({
  name: "db_pool_connections_total",
  help: "Total number of connections in the database pool",
  registers: [metricsRegistry],
});

export const dbPoolIdle = new client.Gauge({
  name: "db_pool_connections_idle",
  help: "Number of idle connections in the database pool",
  registers: [metricsRegistry],
});

export const dbPoolWaiting = new client.Gauge({
  name: "db_pool_connections_waiting",
  help: "Number of clients waiting for a database connection",
  registers: [metricsRegistry],
});

export const dbQueryDuration = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["query_type"] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [metricsRegistry],
});

// --- Service health gauge ---

export const serviceHealthStatus = new client.Gauge({
  name: "service_health_status",
  help: "Health status of services (1=healthy, 0=unhealthy)",
  labelNames: ["service"] as const,
  registers: [metricsRegistry],
});

// Update service health metrics when status changes
statusManager.on("statusChanged", ({ service, newStatus }) => {
  const isHealthy =
    newStatus === StatusConstants.CONNECTED ||
    newStatus === StatusConstants.WARNING
      ? 1
      : 0;
  serviceHealthStatus.labels(service.toLowerCase()).set(isHealthy);
});

// --- Request duration middleware ---

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Skip metrics endpoint itself
  if (req.path === "/metrics") {
    next();
    return;
  }

  httpRequestsInFlight.inc();
  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const route = normalizeRoute(req.route?.path || req.path);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    end(labels);
    httpRequestsTotal.inc(labels);
    httpRequestsInFlight.dec();
  });

  next();
}

/**
 * Normalize route paths to reduce cardinality.
 * Replaces numeric path segments with :id placeholder.
 */
function normalizeRoute(path: string): string {
  return path.replace(/\/\d+/g, "/:id");
}
