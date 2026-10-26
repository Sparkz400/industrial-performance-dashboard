import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  template: vi.fn(),
  trending: vi.fn(),
  alerts: vi.fn(),
  oee: vi.fn(),
  pdf: vi.fn(),
}));
vi.mock("../../repositories/alertRepository.js", () => ({
  alertRepository: { listAlertHistory: mocks.alerts },
}));
vi.mock("../../services/trendingDataService.js", () => ({
  trendingDataService: { queryTrendingData: mocks.trending },
}));
vi.mock("../../services/oeeCalculationService.js", () => ({
  oeeCalculationService: { calculateOee: mocks.oee },
}));
vi.mock("../../services/reportPdf.js", () => ({ writeReportPdf: mocks.pdf }));
import { renderScheduledReport } from "../../services/reportGeneratorService.js";
import type { ReportSnapshot } from "../../database/schema.js";
async function render() {
  const schedule = await mocks.schedule(),
    template = await mocks.template();
  return renderScheduledReport({
    id: 11,
    scheduledFor: new Date("2026-10-26T12:00:00Z"),
    snapshot: {
      name: schedule.name,
      title: template.name,
      config: template.templateConfig,
      timezone: schedule.timezone,
      machineIds: schedule.machineIds,
      recipients: schedule.recipients,
      email: true,
    } as ReportSnapshot,
  });
}

let directory: string;
beforeEach(async () => {
  vi.resetAllMocks();
  directory = await mkdtemp(join(tmpdir(), "report-generator-"));
  process.env.REPORTS_DIR = directory;
  mocks.schedule.mockResolvedValue({
    id: 7,
    templateId: 3,
    name: "Daily",
    timezone: "Europe/Berlin",
    machineIds: [4],
    recipients: ["fixture@example.invalid"],
    deliveryChannels: ["email"],
  });
  mocks.template.mockResolvedValue({
    id: 3,
    name: "Prüfstand",
    templateConfig: {
      sections: [
        { type: "trending", nodeKeys: ["Counter"] },
        { type: "alerts" },
        { type: "oee" },
      ],
    },
  });
  mocks.trending.mockResolvedValue({
    series: [
      {
        displayName: "Counter",
        data: [{ value: 0 }],
        statistics: { average: 0, min: 0, max: 0 },
        sampleCount: 2,
        goodSampleCount: 1,
        resolutionMs: 1000,
        truncated: true,
      },
    ],
  });
  mocks.alerts.mockResolvedValue([
    {
      createdAt: new Date("2026-01-01T12:00:00Z"),
      severity: "high",
      status: "active",
      ruleName: "<script>literal</script>",
      message: "Überdruck Δ 10 °C",
      triggerValue: 0,
    },
  ]);
  mocks.oee.mockResolvedValue({
    dataComplete: false,
    oee: 0.5,
    availability: {
      availability: 0.8,
      runningTimeMinutes: 30,
      plannedStopTimeMinutes: 5,
    },
    performance: { performance: 0.75, totalCount: 20 },
    quality: { quality: 0.9, goodCount: 18, rejectCount: 2 },
  });
  mocks.pdf.mockImplementation((file: string) =>
    writeFile(file, "%PDF-test fixture"),
  );
});
afterEach(async () => {
  delete process.env.REPORTS_DIR;
  await rm(directory, { recursive: true, force: true });
});

describe("scheduled report migration", () => {
  it("preserves all sections, zero values, uncertainty, machine scope, history and PDF attachment", async () => {
    await render();
    const [filename, document] = mocks.pdf.mock.calls[0];
    expect(document.title).toBe("Prüfstand");
    expect(document.sections).toHaveLength(3);
    expect(document.sections[0].table.rows[0]).toEqual([
      "Counter",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
      "1/2 usable samples; 1000 ms buckets; TRUNCATED; continuity unverified",
    ]);
    expect(document.sections[1].table.rows[0]).toContain(
      "01/01/2026, 13:00:00",
    );
    expect(document.sections[1].table.rows[0]).toContain(
      "<script>literal</script>",
    );
    expect(document.sections[2].paragraphs.join(" ")).toContain("provisional");
    expect(mocks.trending.mock.calls[0][0].machineId).toBe(4);
    expect(mocks.alerts.mock.calls[0][0].machineId).toBe(4);
    expect(mocks.oee.mock.calls[0][0]).toBe(4);
    expect(await readFile(filename, "utf8")).toBe("%PDF-test fixture");
  });

  it("keeps missing data unavailable and respects an explicit section machine", async () => {
    mocks.template.mockResolvedValue({
      id: 3,
      name: "Empty",
      templateConfig: {
        lookbackHours: 168,
        sections: [
          { type: "trending", machineId: 9, nodeKeys: ["missing"] },
          { type: "oee", machineId: 9 },
          { type: "legacy-chart" },
        ],
      },
    });
    mocks.trending.mockResolvedValue({ series: [] });
    mocks.oee.mockRejectedValue(new Error("No mapping"));
    await render();
    const document = mocks.pdf.mock.calls[0][1];
    expect(document.sections[0].paragraphs).toEqual(["No data available."]);
    expect(document.sections[1].paragraphs).toEqual([
      "OEE data unavailable: No mapping",
    ]);
    expect(document.sections[2].paragraphs[0]).toContain("not implemented");
    const query = mocks.trending.mock.calls[0][0];
    expect(query.machineId).toBe(9);
    expect(query.endDate.getTime() - query.startDate.getTime()).toBe(
      168 * 3600000,
    );
  });

  it("propagates rendering failure for durable retry without sending a partial PDF", async () => {
    mocks.pdf.mockRejectedValue(new Error("Disk full"));
    await expect(render()).rejects.toThrow("Disk full");
  });
  it("fixes a recovered job's query window to its scheduled instant", async () => {
    await render();
    expect(mocks.trending.mock.calls[0][0].endDate.toISOString()).toBe(
      "2026-10-26T12:00:00.000Z",
    );
  });
});
