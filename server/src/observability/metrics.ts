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

// --- OPC UA metrics ---

export const opcuaDataPointsReceived = new client.Counter({
  name: "opcua_data_points_received_total",
  help: "Total OPC UA data points received",
  labelNames: ["machine_id"] as const,
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
