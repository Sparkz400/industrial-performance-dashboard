import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from "@opentelemetry/semantic-conventions";

const OTEL_ENABLED = process.env.OTEL_ENABLED === "true";
const OTEL_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
const SERVICE_NAME =
  process.env.OTEL_SERVICE_NAME || "performance-dashboard-server";

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  if (!OTEL_ENABLED) {
    console.log(
      "[Tracing] OpenTelemetry disabled (set OTEL_ENABLED=true to enable)",
    );
    return;
  }

  const traceExporter = new OTLPTraceExporter({
    url: `${OTEL_ENDPOINT}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: SERVICE_NAME,
      "service.version": process.env.npm_package_version || "1.0.0",
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:
        process.env.NODE_ENV || "development",
    }),
    traceExporter,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
          const url = req.url || "";
          return (
            url.includes("/health") ||
            url.includes("/metrics") ||
            url.includes("/favicon")
          );
        },
      }),
      new ExpressInstrumentation(),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
    ],
  });

  sdk.start();
  console.log(
    `[Tracing] OpenTelemetry initialized — exporting to ${OTEL_ENDPOINT}`,
  );

  process.on("SIGTERM", () => {
    sdk
      ?.shutdown()
      .then(() => console.log("[Tracing] OpenTelemetry shut down"))
      .catch((err) =>
        console.error("[Tracing] Error shutting down OpenTelemetry:", err),
      );
  });
}

export function shutdownTracing(): Promise<void> {
  if (sdk) {
    return sdk.shutdown();
  }
  return Promise.resolve();
}
