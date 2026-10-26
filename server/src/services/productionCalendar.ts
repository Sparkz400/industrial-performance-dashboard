import { ValidationError } from "../utils/errors.js";
export interface CalendarConfig {
  name: string;
  timezone: string;
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  holidays: string[];
  fold: "reject" | "earlier" | "later";
  breaks: { offsetMinutes: number; durationMinutes: number }[];
  job: { reference: string; product: string; target: number | null };
}
export function localInstant(
  date: string,
  time: string,
  timezone: string,
  fold: CalendarConfig["fold"],
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const components = (ms: number) =>
    Object.fromEntries(parts.formatToParts(ms).map((p) => [p.type, p.value]));
  const wall = Date.parse(`${date}T${time}:00Z`),
    offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const instant = wall + h * 3600000,
      p = components(instant);
    offsets.add(
      Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) -
        instant,
    );
  }
  const matches = [...offsets]
    .map((offset) => wall - offset)
    .filter((ms) => {
      const p = components(ms);
      return (
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` ===
        `${date}T${time}`
      );
    })
    .sort((a, b) => a - b);
  if (!matches.length)
    throw new ValidationError(`${date} ${time} does not exist in ${timezone}`);
  if (matches.length > 1 && fold === "reject")
    throw new ValidationError(
      `${date} ${time} occurs twice; choose the earlier or later occurrence`,
    );
  return new Date(fold === "later" ? matches.at(-1)! : matches[0]);
}
export function calendarWindows(
  config: CalendarConfig,
  from: string,
  to: string,
) {
  const start = Date.parse(from + "T00:00:00Z"),
    end = Date.parse(to + "T00:00:00Z");
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 90 * 86400000
  )
    throw new ValidationError("Choose at most 90 days");
  if (
    new Date(start).toISOString().slice(0, 10) !== from ||
    new Date(end).toISOString().slice(0, 10) !== to
  )
    throw new ValidationError("Choose valid calendar dates");
  const result = [];
  for (let day = start; day <= end; day += 86400000) {
    const date = new Date(day).toISOString().slice(0, 10);
    if (
      !config.weekdays.includes(new Date(day).getUTCDay()) ||
      config.holidays.includes(date)
    )
      continue;
    const begin = localInstant(
      date,
      config.startTime,
      config.timezone,
      config.fold,
    );
    result.push({
      date,
      start: begin.toISOString(),
      end: new Date(
        begin.getTime() + config.durationMinutes * 60000,
      ).toISOString(),
      breaks: config.breaks.map((b) => ({
        start: new Date(
          begin.getTime() + b.offsetMinutes * 60000,
        ).toISOString(),
        end: new Date(
          begin.getTime() + (b.offsetMinutes + b.durationMinutes) * 60000,
        ).toISOString(),
      })),
    });
  }
  return result;
}
