import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export interface ReportSection {
  title: string;
  paragraphs?: string[];
  table?: { headers: string[]; widths: number[]; rows: string[][] };
}

export interface ReportContent {
  title: string;
  generatedAt: Date;
  period: string;
  sections: ReportSection[];
}

/** Writes text and vectors only: report values are never HTML, URLs or executable code. */
export async function writeReportPdf(
  destination: string,
  report: ReportContent,
): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.partial`;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 56, left: 42, right: 42 },
    bufferPages: true,
    info: {
      Title: report.title,
      Author: "Performance Dashboard",
      CreationDate: report.generatedAt,
    },
  });
  const complete = pipeline(doc, createWriteStream(temporary, { flags: "wx" }));
  try {
    doc.registerFont(
      "Report",
      fileURLToPath(
        new URL("../../assets/fonts/NotoSans-Regular.ttf", import.meta.url),
      ),
    );
    doc.registerFont(
      "ReportBold",
      fileURLToPath(
        new URL("../../assets/fonts/NotoSans-Bold.ttf", import.meta.url),
      ),
    );
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const body = () => doc.font("Report").fontSize(9).fillColor("#263238");
    const ensureSpace = (height: number) => {
      if (doc.y + height > bottom()) doc.addPage();
    };
    doc
      .font("ReportBold")
      .fontSize(9)
      .fillColor("#53627a")
      .text("PERFORMANCE DASHBOARD");
    doc
      .moveDown(0.6)
      .fontSize(22)
      .fillColor("#1a237e")
      .text(report.title, { width });
    doc.moveDown(0.4);
    body().text(report.period, { width });
    doc.moveDown(1);

    for (const section of report.sections) {
      ensureSpace(80);
      doc
        .font("ReportBold")
        .fontSize(14)
        .fillColor("#283593")
        .text(section.title, left, doc.y, { width });
      doc.moveDown(0.5);
      for (const paragraph of section.paragraphs ?? []) {
        body().text(paragraph, left, doc.y, { width });
        doc.moveDown(0.5);
      }
      if (section.table) {
        const table = section.table;
        const sum = table.widths.reduce((a, b) => a + b, 0);
        const widths = table.widths.map((w) => (w / sum) * width);
        const padding = 6;
        const textOptions = (i: number) => ({
          width: widths[i] - padding * 2,
          lineGap: 1,
        });
        const rowHeight = (cells: string[]) =>
          Math.max(
            14,
            ...cells.map((text, i) =>
              doc.heightOfString(text || " ", textOptions(i)),
            ),
          ) +
          padding * 2;
        const row = (
          cells: string[],
          height: number,
          header: boolean,
          shade: boolean,
        ) => {
          const y = doc.y;
          let x = left;
          for (let i = 0; i < widths.length; i++) {
            doc
              .rect(x, y, widths[i], height)
              .fillAndStroke(
                header ? "#e8eaf6" : shade ? "#f7f9fc" : "#ffffff",
                "#d5dce5",
              );
            doc
              .fillColor("#263238")
              .text(cells[i] || "", x + padding, y + padding, textOptions(i));
            x += widths[i];
          }
          doc.x = left;
          doc.y = y + height;
        };
        const header = () => {
          doc.font("ReportBold").fontSize(8);
          const height = rowHeight(table.headers);
          ensureSpace(height + 30);
          row(table.headers, height, true, false);
          body().fontSize(8);
        };
        header();
        for (const [index, values] of table.rows.entries()) {
          let cells = table.headers.map((_, i) => values[i] ?? "");
          do {
            let height = rowHeight(cells);
            if (
              doc.y + height > bottom() &&
              doc.y > doc.page.margins.top + 40
            ) {
              doc.addPage();
              header();
              height = rowHeight(cells);
            }
            const available = bottom() - doc.y;
            if (height <= available) {
              row(cells, height, false, index % 2 === 1);
              break;
            }
            // Split oversized cells across pages; never clamp or discard long alarm text.
            const parts = cells.map((text, i) => {
              const characters = Array.from(text);
              let low = 0,
                high = characters.length;
              while (low < high) {
                const middle = Math.ceil((low + high) / 2);
                if (
                  doc.heightOfString(
                    characters.slice(0, middle).join(""),
                    textOptions(i),
                  ) <=
                  available - padding * 2 - 2
                )
                  low = middle;
                else high = middle - 1;
              }
              return [
                characters.slice(0, low).join(""),
                characters.slice(low).join(""),
              ];
            });
            if (!parts.some(([part]) => part.length))
              throw new Error("Report table cannot fit a line on the page");
            const visible = parts.map(([part]) => part);
            row(visible, rowHeight(visible), false, index % 2 === 1);
            cells = parts.map(([, rest]) => rest);
            doc.addPage();
            header();
          } while (cells.some(Boolean));
        }
      }
      doc.moveDown(1);
    }
    const pages = doc.bufferedPageRange();
    for (let page = pages.start; page < pages.start + pages.count; page++) {
      doc.switchToPage(page);
      // Footers live inside the reserved margin; prevent automatic page creation.
      const margin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 32;
      doc.font("Report").fontSize(7).fillColor("#64748b");
      doc.text(`Generated ${report.generatedAt.toISOString()}`, left, y, {
        width,
        lineBreak: false,
      });
      doc.text(`Page ${page + 1} of ${pages.count}`, left, y, {
        width,
        align: "right",
        lineBreak: false,
      });
      doc.page.margins.bottom = margin;
    }
    doc.end();
    await complete;
    await rename(temporary, destination);
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error(String(error)));
    await complete.catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  }
}
