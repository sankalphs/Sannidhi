import { describe, expect, it } from "vitest";

import { renderReportPdf } from "@/lib/analytics/pdf";

function decode(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

function findObject(text: string, id: number): string {
  const start = text.indexOf(`${id} 0 obj`);
  if (start === -1) throw new Error(`object ${id} not found`);
  const end = text.indexOf("endobj", start);
  return text.slice(start, end);
}

describe("renderReportPdf", () => {
  it("starts with the PDF header and ends with the EOF marker", () => {
    const bytes = renderReportPdf({
      title: "Report",
      subtitle: "Subtitle",
      columns: ["A"],
      rows: [["a"]],
    });
    const text = decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.endsWith("%%EOF\n")).toBe(true);
  });

  it("contains the title and subtitle as escaped PDF strings", () => {
    const bytes = renderReportPdf({
      title: "Attendance (Daily)",
      subtitle: "Past 24 hours",
      columns: ["Student"],
      rows: [["s1"]],
    });
    const text = decode(bytes);
    expect(text).toContain("Attendance \\(Daily\\)");
    expect(text).toContain("Past 24 hours");
  });

  it("escapes backslashes and replaces out-of-range characters with a question mark", () => {
    const bytes = renderReportPdf({
      title: "Back\\slash",
      subtitle: "ok",
      columns: ["A"],
      rows: [["é中文"]],
    });
    const text = decode(bytes);
    expect(text).toContain("Back\\\\slash");
    expect(text).toContain("é??");
  });

  it("places every object at the byte offset its xref entry claims", () => {
    const bytes = renderReportPdf({
      title: "T",
      subtitle: "S",
      columns: ["A", "B"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    });
    const text = decode(bytes);

    const xrefStart = Number.parseInt(
      text.slice(text.lastIndexOf("startxref") + "startxref\n".length),
      10,
    );
    const xrefSection = text.slice(xrefStart);
    expect(xrefSection.startsWith("xref")).toBe(true);

    const sizeMatch = xrefSection.match(/^xref\n0 (\d+)/);
    expect(sizeMatch).not.toBeNull();
    const size = Number(sizeMatch![1]);

    const lines = xrefSection.split("\n");
    for (let id = 1; id < size; id += 1) {
      const entry = lines[2 + id];
      const offset = Number.parseInt(entry.slice(0, 10), 10);
      expect(offset).toBeGreaterThan(0);
      expect(text.slice(offset).startsWith(`${id} 0 obj`)).toBe(true);
    }

    const trailerMatch = text.match(/trailer\n<< \/Size (\d+) \/Root 1 0 R >>/);
    expect(trailerMatch).not.toBeNull();
    expect(Number(trailerMatch![1])).toBe(size);
  });

  it("declares Helvetica and Helvetica-Bold with WinAnsiEncoding", () => {
    const bytes = renderReportPdf({
      title: "T",
      subtitle: "S",
      columns: ["A"],
      rows: [],
    });
    const text = decode(bytes);
    expect(text).toContain("/BaseFont /Helvetica /Encoding /WinAnsiEncoding");
    expect(text).toContain("/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding");
  });

  it("uses Letter media boxes", () => {
    const bytes = renderReportPdf({
      title: "T",
      subtitle: "S",
      columns: ["A"],
      rows: [],
    });
    const text = decode(bytes);
    expect(text).toContain("/MediaBox [0 0 612 792]");
  });

  it("paginates with repeating column headers when rows exceed one page", () => {
    const rows = Array.from({ length: 120 }, (_, index) => [String(index), `row ${index}`]);
    const bytes = renderReportPdf({
      title: "T",
      subtitle: "S",
      columns: ["ID", "Label"],
      rows,
    });
    const text = decode(bytes);
    const pageCount = (text.match(/\/Type \/Page /g) ?? []).length;
    expect(pageCount).toBe(3);
    expect(text).toContain("/Count 3");

    const singleBytes = renderReportPdf({
      title: "T",
      subtitle: "S",
      columns: ["ID", "Label"],
      rows: [["1", "x"]],
    });
    expect((decode(singleBytes).match(/\/Type \/Page /g) ?? []).length).toBe(1);
  });

  it("truncates long cell text to the column width", () => {
    const bytes = renderReportPdf({
      title: "T",
      subtitle: "S",
      columns: ["One"],
      rows: [["a".repeat(200)]],
    });
    const text = decode(bytes);
    const longestRun = text.match(/a+/g)?.reduce((a, b) => (a.length >= b.length ? a : b), "");
    // Column width is (612-80)/1 = 532pt; at 0.5*9pt per char that is 118 chars.
    expect(longestRun!.length).toBe(118);
  });

  it("is deterministic across calls", () => {
    const input = {
      title: "T",
      subtitle: "S",
      columns: ["A", "B"],
      rows: [
        ["1", "2"],
        ["3", "4"],
      ],
    };
    const first = renderReportPdf(input);
    const second = renderReportPdf(input);
    expect(Array.from(first)).toEqual(Array.from(second));
  });

  it("keeps object ids consistent between the pages tree and page objects", () => {
    const bytes = renderReportPdf({
      title: "T",
      subtitle: "S",
      columns: ["A"],
      rows: Array.from({ length: 100 }, (_, index) => [String(index)]),
    });
    const text = decode(bytes);
    const kidsMatch = text.match(/\/Kids \[([^\]]+)\]/);
    expect(kidsMatch).not.toBeNull();
    const kidIds = kidsMatch![1].match(/\d+ 0 R/g);
    expect(kidIds).toEqual(["3 0 R", "4 0 R", "5 0 R"]);
    for (const id of [3, 4, 5]) {
      expect(findObject(text, id)).toContain("/Type /Page ");
    }
  });
});
