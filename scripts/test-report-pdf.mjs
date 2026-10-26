import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { writeReportPdf } from "../server/dist/src/services/reportPdf.js";

const directory = resolve(".local/report-evidence");
await mkdir(directory, { recursive: true });
const report = {
  title: "Production review - Prüfstand München Δ",
  generatedAt: new Date("2026-10-26T06:00:00Z"),
  period:
    "Period: 2026-10-25T06:00:00Z to 2026-10-26T06:00:00Z\nAlert display timezone: Europe/Berlin",
  sections: [
    {
      title: "Trending Data - Machine 4",
      paragraphs: ["Measurements preserve zero values and unknown coverage."],
      table: {
        headers: [
          "Tag",
          "Latest displayed",
          "Avg",
          "Min",
          "Max",
          "Points / coverage",
        ],
        widths: [100, 60, 45, 45, 45, 216],
        rows: [
          [
            "Kühlwasser °C",
            "23.50",
            "23.25",
            "22.00",
            "24.00",
            "120/122 usable samples; 1000 ms buckets; full query window; continuity unverified",
          ],
          [
            "Counter",
            "0.00",
            "0.00",
            "0.00",
            "0.00",
            "2/2 usable samples; continuity unverified",
          ],
          [
            "Pressure μbar",
            "N/A",
            "N/A",
            "N/A",
            "N/A",
            "0/2 usable samples; TRUNCATED; continuity unverified",
          ],
        ],
      },
    },
    {
      title: "Alerts - Machine 4",
      paragraphs: ["Alerts shown: 2. high: 1; low: 1"],
      table: {
        headers: ["Time", "Severity", "Status", "Rule", "Message", "Value"],
        widths: [83, 48, 54, 77, 201, 48],
        rows: [
          [
            "26/10/2026, 06:00:00",
            "high",
            "acknowledged",
            "Überdruck",
            "Pressure outside operating range ± 2 bar. Operator checking the valve.",
            "12",
          ],
          [
            "26/10/2026, 06:05:00",
            "low",
            "resolved",
            "Flow",
            "Δ flow restored. Кириллица. <script>literal text</script>",
            "0",
          ],
        ],
      },
    },
    {
      title: "OEE Summary - Machine 4",
      paragraphs: [
        "Incomplete measurement coverage. These figures are provisional.",
        "OEE: 43.3%",
      ],
      table: {
        headers: ["Metric", "Value", "Details"],
        widths: [110, 80, 321],
        rows: [
          ["Availability", "50.0%", "Running: 30.0 min, Planned stop: 0.0 min"],
          ["Performance", "100.0%", "Total count: 15"],
          ["Quality", "86.7%", "Good: 13, Rejected: 2"],
        ],
      },
    },
  ],
};
await writeReportPdf(resolve(directory, "standard.pdf"), report);
const longRows = Array.from({ length: 200 }, (_, index) => [
  String(index + 1),
  `Alarm ${index + 1}`,
  index === 100
    ? "LONG_MESSAGE_START " +
      "Investigate the valve and record the measured pressure. ".repeat(160) +
      " LONG_MESSAGE_END"
    : `ROW_${String(index + 1).padStart(3, "0")} - Überdruck Δ ± 2 bar`,
  "0",
]);
await writeReportPdf(resolve(directory, "long-table.pdf"), {
  ...report,
  title: "Long alarm history",
  sections: [
    {
      title: "Alarm history",
      paragraphs: ["Display limit reached: additional alerts may exist."],
      table: {
        headers: ["No.", "Rule", "Message", "Value"],
        widths: [35, 85, 345, 46],
        rows: longRows,
      },
    },
  ],
});
await writeFile(
  resolve(directory, "fixture.json"),
  JSON.stringify(report, null, 2),
);
for (const name of ["standard.pdf", "long-table.pdf"])
  assert.equal(
    (await readFile(resolve(directory, name))).subarray(0, 4).toString(),
    "%PDF",
  );
await assert.rejects(
  writeReportPdf(resolve(directory, "missing", "failed.pdf"), report),
  /ENOENT/,
);
await assert.rejects(writeReportPdf(directory, report));
assert.ok(
  !(await readdir(resolve(directory, ".."))).includes(
    "report-evidence.partial",
  ),
  "Failed publication left a partial PDF",
);
console.log(
  "PASS: standard and 200-row PDFs generated, including an alarm message longer than one page",
);
