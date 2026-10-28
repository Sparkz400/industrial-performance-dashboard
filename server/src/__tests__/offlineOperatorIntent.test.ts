import { describe, expect, it } from "vitest";
import {
  offlineIntentDigest,
  validateOfflineDraft,
} from "../services/offlineOperatorIntent.js";

describe("offline operator intent", () => {
  const now = Date.parse("2026-10-28T12:00:00Z");
  it("accepts online requests and bounded offline drafts", () => {
    expect(() => validateOfflineDraft(undefined, now)).not.toThrow();
    expect(() =>
      validateOfflineDraft("2026-10-27T12:00:01Z", now),
    ).not.toThrow();
    expect(() =>
      validateOfflineDraft("2026-10-28T12:01:00Z", now),
    ).not.toThrow();
  });
  it("refuses expired, invalid and future clocks", () => {
    for (const value of [
      "2026-10-27T12:00:00Z",
      "invalid",
      "2026-10-28T12:01:01Z",
    ])
      expect(() => validateOfflineDraft(value, now)).toThrow();
  });
  it("binds retries to the original edit regardless of object key order", () => {
    expect(offlineIntentDigest({ text: "A", version: 1 })).toBe(
      offlineIntentDigest({ version: 1, text: "A" }),
    );
    expect(offlineIntentDigest({ text: "A", version: 1 })).not.toBe(
      offlineIntentDigest({ text: "B", version: 1 }),
    );
  });
});
