import { expect, it, vi } from "vitest";

const options = vi.hoisted(() => ({ http: {} as any, pg: {} as any }));
vi.mock("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start() {}
    shutdown() {
      return Promise.resolve();
    }
  },
}));
vi.mock("@opentelemetry/instrumentation-http", () => ({
  HttpInstrumentation: class {
    constructor(config: any) {
      options.http = config;
    }
  },
}));
vi.mock("@opentelemetry/instrumentation-pg", () => ({
  PgInstrumentation: class {
    constructor(config: any) {
      options.pg = config;
    }
  },
}));

it("excludes sign-in and share URLs from tracing and disables database parameter capture", async () => {
  vi.stubEnv("OTEL_ENABLED", "true");
  const signal = vi.spyOn(process, "on").mockReturnValue(process);
  try {
    const tracing = await import("../../observability/tracing.js");
    tracing.initTracing();
    for (const url of [
      "/api/v1/auth/oidc/callback?code=secret",
      "/api/v1/share/public/secret",
      "/embed/secret",
    ])
      expect(options.http.ignoreIncomingRequestHook({ url })).toBe(true);
    expect(
      options.http.ignoreIncomingRequestHook({ url: "/api/v1/history/1" }),
    ).toBe(false);
    expect(options.pg.enhancedDatabaseReporting).toBe(false);
    await tracing.shutdownTracing();
  } finally {
    vi.unstubAllEnvs();
    signal.mockRestore();
  }
});
