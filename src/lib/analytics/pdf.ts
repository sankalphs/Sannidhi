const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 40;
const USABLE_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const TITLE_SIZE = 16;
const SUBTITLE_SIZE = 10;
const COLUMN_HEADER_SIZE = 9;
const ROW_SIZE = 9;
const LINE_HEIGHT = 14;
const BOTTOM_LIMIT = 40;
const ESTIMATED_CHAR_WIDTH = 0.5;

/** Escapes a PDF string literal: backslash and parens are special, high codepoints become '?'. */
function escapePdfText(text: string): string {
  let escaped = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    if (code > 255) {
      escaped += "?";
    } else if (ch === "\\") {
      escaped += "\\\\";
    } else if (ch === "(" || ch === ")") {
      escaped += `\\${ch}`;
    } else {
      escaped += ch;
    }
  }
  return escaped;
}

/** Truncates text to the approximate 0.5*size-per-char width budget, without an ellipsis. */
function truncateToWidth(text: string, columnWidth: number, size: number): string {
  const maxChars = Math.max(0, Math.floor(columnWidth / (ESTIMATED_CHAR_WIDTH * size)));
  return text.slice(0, maxChars);
}

/**
 * Single-font-family PDF 1.4 report renderer: deterministic, dependency-free,
 * paginates a titled table with repeating column headers across Letter pages.
 * Built as a latin1 string and encoded byte-by-byte so it runs in any JS runtime.
 */
export function renderReportPdf(input: {
  title: string;
  subtitle: string;
  columns: string[];
  rows: string[][];
}): Uint8Array {
  const columnWidth = USABLE_WIDTH / input.columns.length;
  const columnXPositions = input.columns.map((_, index) => MARGIN + index * columnWidth);

  const pages: string[][] = [];
  let currentOps: string[] = [];
  let currentY = 0;

  const drawText = (
    text: string,
    x: number,
    y: number,
    size: number,
    font: "F1" | "F2",
    gray?: number,
  ) => {
    const ops: string[] = [];
    if (gray !== undefined) ops.push(`${gray} g`);
    ops.push(`BT /${font} ${size} Tf ${x} ${PAGE_HEIGHT - y} Td (${escapePdfText(text)}) Tj ET`);
    if (gray !== undefined) ops.push("0 g");
    currentOps.push(ops.join(" "));
  };

  const drawRowCells = (cells: string[], size: number, bold: boolean, gray?: number) => {
    cells.forEach((cell, index) => {
      drawText(
        truncateToWidth(cell, columnWidth, size),
        columnXPositions[index] ?? MARGIN,
        currentY,
        size,
        bold ? "F2" : "F1",
        gray,
      );
    });
  };

  const drawColumnHeaders = () => {
    currentY += LINE_HEIGHT;
    drawRowCells(input.columns, COLUMN_HEADER_SIZE, true);
  };

  const startPage = () => {
    if (currentOps.length > 0) pages.push(currentOps);
    currentOps = [];
    currentY = MARGIN;
    drawColumnHeaders();
  };

  currentY = MARGIN + TITLE_SIZE;
  drawText(input.title, MARGIN, currentY, TITLE_SIZE, "F2");
  currentY += SUBTITLE_SIZE + 6;
  drawText(input.subtitle, MARGIN, currentY, SUBTITLE_SIZE, "F1", 0.4);
  drawColumnHeaders();

  for (const row of input.rows) {
    if (currentY + LINE_HEIGHT > PAGE_HEIGHT - BOTTOM_LIMIT) {
      startPage();
      // startPage leaves currentY at the repeated header baseline; advance
      // below it so the first row of the new page never overlaps the header.
      currentY += LINE_HEIGHT;
    } else {
      currentY += LINE_HEIGHT;
    }
    drawRowCells(row, ROW_SIZE, false);
  }
  pages.push(currentOps);

  const pagesCount = pages.length;
  const firstPageId = 3;
  const firstFontId = firstPageId + pagesCount;
  const firstContentId = firstFontId + 2;

  const contentBodies = pages.map((ops) => {
    const content = ops.join("\n");
    return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  const objects: Array<{ id: number; body: string }> = [];
  objects.push({ id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" });
  objects.push({
    id: 2,
    body: `<< /Type /Pages /Kids [${Array.from({ length: pagesCount }, (_, index) => `${firstPageId + index} 0 R`).join(" ")}] /Count ${pagesCount} >>`,
  });
  pages.forEach((_, index) => {
    objects.push({
      id: firstPageId + index,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${firstFontId} 0 R /F2 ${firstFontId + 1} 0 R >> >> /Contents ${firstContentId + index} 0 R >>`,
    });
  });
  objects.push({
    id: firstFontId,
    body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  });
  objects.push({
    id: firstFontId + 1,
    body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  });
  contentBodies.forEach((body, index) => {
    objects.push({ id: firstContentId + index, body });
  });

  const maxId = objects[objects.length - 1].id;
  let pdf = "%PDF-1.4\n";
  const offsets = new Map<number, number>();
  for (const object of objects) {
    offsets.set(object.id, pdf.length);
    pdf += `${object.id} 0 obj\n${object.body}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets.get(id) ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i += 1) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}
