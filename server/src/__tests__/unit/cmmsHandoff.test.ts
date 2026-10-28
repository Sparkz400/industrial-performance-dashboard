import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cmmsDestinationDigest,
  verifyCmmsReview,
  type CmmsReview,
} from "../../services/cmmsHandoff.js";
import { canonicalJson } from "../../utils/canonicalJson.js";
const review: CmmsReview = {
  machineId: 1,
  actorId: 2,
  actionId: 3,
  webhookId: 4,
  source: "owned-install",
  actionVersion: 1,
  contentDigest: "a".repeat(64),
  destinationDigest: "b".repeat(64),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
const sign = (r: CmmsReview) =>
  createHmac("sha256", "test-session-secret")
    .update(canonicalJson(r))
    .digest("hex");
describe("CMMS reviewed delivery", () => {
  it("binds the review to actor, asset, payload, destination and expiry", () => {
    expect(() => verifyCmmsReview(review, sign(review), 2, 1)).not.toThrow();
    expect(() => verifyCmmsReview(review, sign(review), 3, 1)).toThrow();
    expect(() => verifyCmmsReview(review, sign(review), 2, 2)).toThrow();
    expect(() =>
      verifyCmmsReview({ ...review, actionVersion: 2 }, sign(review), 2, 1),
    ).toThrow();
    const expired = { ...review, expiresAt: "2020-01-01T00:00:00Z" };
    expect(() => verifyCmmsReview(expired, sign(expired), 2, 1)).toThrow();
    expect(() => verifyCmmsReview(review, "short", 2, 1)).toThrow();
  });
  it("detects destination edits and supports database and service field casing", () => {
    const value = {
      id: 1,
      name: "Owned",
      url: "https://example.invalid/cmms",
      events: ["cmms.handoff"],
      isActive: true,
    };
    expect(cmmsDestinationDigest(value)).toBe(
      cmmsDestinationDigest({ ...value, isActive: undefined, is_active: true }),
    );
    expect(cmmsDestinationDigest(value)).not.toBe(
      cmmsDestinationDigest({
        ...value,
        url: "https://different.invalid/cmms",
      }),
    );
    expect(cmmsDestinationDigest(value)).not.toBe(
      cmmsDestinationDigest({ ...value, isActive: false }),
    );
  });
});
