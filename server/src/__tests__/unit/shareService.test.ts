import { describe, expect, it, vi } from "vitest";
vi.mock("../../database/db.js", () => ({ default: {} }));
const resolve = vi.fn();
vi.mock("../../services/shareService.js", async (original) => ({
  ...(await original<typeof import("../../services/shareService.js")>()),
  shareService: { resolve: (...args: unknown[]) => resolve(...args) },
}));
import {
  hashShareToken,
  normalizeOrigin,
  selectWidgets,
} from "../../services/shareService.js";
import { embedFramePolicy } from "../../routes/shareRoutes.js";

const trend = (id: string, config: Record<string, unknown>) => ({
  id,
  type: "trendingExplorer",
  config,
});

describe("selected-data share selection", () => {
  it("freezes only the chosen trend widgets and their signals", () => {
    const widgets = [
      trend("a", {
        machineId: 3,
        defaultTags: ["Count", "Count", "Temp"],
        title: "Line",
      }),
      trend("b", { machineId: 4, defaultTags: ["Secret"] }),
    ];
    expect(selectWidgets(widgets, ["a", "a"])).toEqual([
      { id: "a", title: "Line", machineId: 3, nodeKeys: ["Count", "Temp"] },
    ]);
  });

  it.each([
    [[{ id: "s", type: "systemStatus", config: {} }], "s"],
    [[trend("t", { machineId: 3, defaultTags: [] })], "t"],
    [[trend("t", { machineId: "3", defaultTags: ["Count"] })], "t"],
    [
      [
        trend("t", {
          machineId: 3,
          defaultTags: Array(33)
            .fill("k")
            .map((k, i) => k + i),
        }),
      ],
      "t",
    ],
    [[trend("t", { machineId: 3, defaultTags: [" "] })], "t"],
    [[trend("t", { machineId: 3, defaultTags: ["Count"] })], "missing"],
  ])("rejects widgets that are not bounded trends (%#)", (widgets, id) => {
    expect(() => selectWidgets(widgets, [id])).toThrow();
  });

  it("requires between one and twelve widgets", () => {
    expect(() => selectWidgets([], [])).toThrow();
    const many = Array.from({ length: 13 }, (_, i) =>
      trend(String(i), { machineId: 1, defaultTags: ["k"] }),
    );
    expect(() =>
      selectWidgets(
        many,
        many.map((w) => w.id),
      ),
    ).toThrow();
  });
});

describe("embedding origins", () => {
  it("accepts exact origins only", () => {
    expect(normalizeOrigin("https://intranet.example")).toBe(
      "https://intranet.example",
    );
    expect(normalizeOrigin("http://10.0.0.5:8080")).toBe(
      "http://10.0.0.5:8080",
    );
    for (const value of [
      "https://*.example",
      "https://intranet.example/",
      "https://intranet.example/path",
      "javascript:alert(1)",
      "intranet.example",
      "https://intranet.example 'unsafe-inline'",
      "data:text/html,x",
    ])
      expect(() => normalizeOrigin(value)).toThrow();
  });
});

it("stores a SHA-256 digest rather than the link token", () => {
  expect(hashShareToken("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

describe("embed frame policy", () => {
  const run = async (
    share: unknown,
    csp = "default-src 'self';frame-ancestors 'self'",
  ) => {
    resolve.mockResolvedValueOnce(share);
    const headers = new Map<string, unknown>([
      ["Content-Security-Policy", csp],
      ["X-Frame-Options", "SAMEORIGIN"],
    ]);
    const res = {
      getHeader: (name: string) => headers.get(name),
      setHeader: (name: string, value: unknown) => headers.set(name, value),
      removeHeader: (name: string) => headers.delete(name),
      set: (values: Record<string, string>) =>
        Object.entries(values).forEach(([k, v]) => headers.set(k, v)),
    };
    const next = vi.fn();
    embedFramePolicy({ params: { token: "t" } } as never, res as never, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    return headers;
  };

  it("lets only the listed origins frame an embeddable link", async () => {
    const headers = await run({
      allowEmbed: true,
      allowedOrigins: ["https://intranet.example", "http://10.0.0.5:8080"],
    });
    expect(headers.get("Content-Security-Policy")).toBe(
      "default-src 'self';frame-ancestors https://intranet.example http://10.0.0.5:8080",
    );
    expect(headers.has("X-Frame-Options")).toBe(false);
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it.each([null, { allowEmbed: false, allowedOrigins: [] }])(
    "forbids framing for unknown, expired or non-embeddable links (%#)",
    async (share) => {
      const headers = await run(share);
      expect(headers.get("Content-Security-Policy")).toBe(
        "default-src 'self';frame-ancestors 'none'",
      );
    },
  );

  it("adds a frame-ancestors directive when the policy has none", async () => {
    const headers = await run(null, "default-src 'self'");
    expect(headers.get("Content-Security-Policy")).toBe(
      "default-src 'self';frame-ancestors 'none'",
    );
  });
});
