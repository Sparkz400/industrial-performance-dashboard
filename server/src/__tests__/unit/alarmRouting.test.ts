import { expect, it } from "vitest";
import { routesAlarm } from "../../services/alarmRouting.js";

it("routes alarms by event, lowest severity and machine", () => {
  const destination = {
    events: ["alarm.triggered"],
    minSeverity: "high",
    machineIds: [1],
  };
  expect(routesAlarm(destination, "alarm.triggered", "high", 1)).toBe(true);
  expect(routesAlarm(destination, "alarm.triggered", "critical", 1)).toBe(true);
  expect(routesAlarm(destination, "alarm.triggered", "medium", 1)).toBe(false);
  expect(routesAlarm(destination, "alarm.triggered", "high", 2)).toBe(false);
  expect(routesAlarm(destination, "alarm.triggered", "high", null)).toBe(false);
  expect(routesAlarm(destination, "alarm.cleared", "high", 1)).toBe(false);
  // An unknown severity never passes a severity filter.
  expect(routesAlarm(destination, "alarm.triggered", undefined, 1)).toBe(false);
  // No filters: every machine and severity of a subscribed event.
  expect(
    routesAlarm(
      { events: ["*"], minSeverity: null, machineIds: [] },
      "alarm.cleared",
      "info",
      null,
    ),
  ).toBe(true);
});
