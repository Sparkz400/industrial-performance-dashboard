import { describe, expect, it } from "vitest";
import {
  parseWorkOrders,
  type OrderDocument,
} from "../../services/workOrderExchange.js";

const order = {
  externalId: "A-1",
  product: "Part A",
  target: 0,
  start: "2026-01-01T01:00:00+01:00",
  end: "2026-01-01T02:00:00+01:00",
  timezone: "Europe/Berlin",
};
const document = (orders: unknown[]): OrderDocument => ({
  version: "work-orders-v1",
  source: "owned",
  orders,
});
describe("bounded work-order contract", () => {
  it("retains zero targets and normalizes explicitly offset instants", () => {
    const result = parseWorkOrders(document([order]))[0];
    expect(result.status).toBe("ready");
    expect(result.order?.target).toBe(0);
    expect(result.order?.start).toBe("2026-01-01T00:00:00.000Z");
    expect(
      parseWorkOrders(document([{ ...order, target: null }]))[0].order?.target,
    ).toBeNull();
  });
  it("reports each bad row without inventing targets or local timezones", () => {
    const rows = parseWorkOrders(
      document([
        null,
        { ...order, start: "2026-01-01T00:00:00" },
        { ...order, timezone: "Not/AZone" },
        { ...order, target: -1 },
        { ...order, start: order.end },
        { ...order, extra: true },
      ]),
    );
    expect(rows.every((row) => row.status === "rejected")).toBe(true);
    expect(rows.every((row) => !!row.reason)).toBe(true);
  });
  it("rejects every duplicate external ID and excessive time spans", () => {
    expect(
      parseWorkOrders(document([order, order])).map((row) => row.status),
    ).toEqual(["rejected", "rejected"]);
    expect(
      parseWorkOrders(document([{ ...order, end: "2026-02-01T00:00:00Z" }]))[0]
        .status,
    ).toBe("rejected");
  });
});
