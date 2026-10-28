import { beforeEach, expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({
  query: vi.fn(),
}));
vi.mock("../../database/dbConnection.js", () => ({
  default: { pool: { query } },
}));

import {
  notificationResume,
  maintenanceOwners,
  validateMaintenanceAction,
} from "../../services/maintenanceActions.js";
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

const action = () => ({
  dueAt: new Date(Date.now() + 3600000).toISOString(),
  suppressionUntil: null,
  quietStart: null,
  quietEnd: null,
  ownerId: 1,
  escalationOwnerId: 2,
});
beforeEach(() => {
  query.mockResolvedValue({
    rows: [
      { id: 1, username: "Assigned operator" },
      { id: 2, username: "Administrator" },
    ],
  });
});
it("limits assignment to active operational users with this machine's grants", async () => {
  expect(await maintenanceOwners(10)).toEqual([
    { id: 1, username: "Assigned operator" },
    { id: 2, username: "Administrator" },
  ]);
  await expect(
    validateMaintenanceAction(action(), 10),
  ).resolves.toBeUndefined();
  await expect(
    validateMaintenanceAction({ ...action(), ownerId: 3 }, 10),
  ).rejects.toThrow("permission to operate");
});
it("refuses past deadlines, expired suppression and suppression beyond 24 hours", async () => {
  await expect(
    validateMaintenanceAction(
      { ...action(), dueAt: new Date(Date.now() - 1).toISOString() },
      10,
    ),
  ).rejects.toThrow("future");
  for (const delta of [-1, 86401000])
    await expect(
      validateMaintenanceAction(
        {
          ...action(),
          suppressionUntil: new Date(Date.now() + delta).toISOString(),
        },
        10,
      ),
    ).rejects.toThrow("24 hours");
});
it("requires both UTC quiet-hour endpoints and refuses all-day suppression", async () => {
  for (const settings of [
    { quietStart: 1, quietEnd: null },
    { quietStart: null, quietEnd: 2 },
    { quietStart: 2, quietEnd: 2 },
  ])
    await expect(
      validateMaintenanceAction({ ...action(), ...settings }, 10),
    ).rejects.toThrow("distinct UTC");
});

it("allows an overdue action correction only when the existing deadline is preserved", async () => {
  const previous = new Date(Date.now() - 3600000);
  await expect(
    validateMaintenanceAction(
      { ...action(), dueAt: previous.toISOString() },
      10,
      previous,
    ),
  ).resolves.toBeUndefined();
  await expect(
    validateMaintenanceAction(
      { ...action(), dueAt: new Date(previous.getTime() + 1000).toISOString() },
      10,
      previous,
    ),
  ).rejects.toThrow("future");
});
