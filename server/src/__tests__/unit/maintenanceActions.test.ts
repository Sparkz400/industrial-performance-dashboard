import { expect, it, vi } from "vitest";
vi.mock("../../database/dbConnection.js", () => ({ default: {} }));
import { notificationResume } from "../../services/maintenanceActions.js";
it("expires suppression and handles overnight quiet hours in UTC", () => {
  const now = new Date("2026-01-01T23:00:00Z");
  expect(notificationResume(now, null, 22 * 60, 6 * 60)?.toISOString()).toBe(
    "2026-01-02T06:00:00.000Z",
  );
  expect(
    notificationResume(new Date("2026-01-02T06:00:00Z"), now, 22 * 60, 6 * 60),
  ).toBeNull();
  expect(
    notificationResume(
      now,
      new Date("2026-01-02T07:00:00Z"),
      22 * 60,
      6 * 60,
    )?.toISOString(),
  ).toBe("2026-01-02T07:00:00.000Z");
});
