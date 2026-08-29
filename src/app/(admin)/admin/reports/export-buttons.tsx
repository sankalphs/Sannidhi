"use client";

import { Button } from "@/components/ui/button";
import { toCsv, renderReportPdf } from "@/lib/analytics";

type ExportRow = {
  studentName: string;
  studentEmail: string;
  courseCode: string;
  sectionName: string;
  state: string;
  reasonCodes: string[];
  capturedAt: number;
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function truncate(text: string, max = 40): string {
  return text.length > max ? text.slice(0, max) : text;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Builds a client-side download (CSV or PDF) for the report rows passed from the RSC. */
function exportRows(rows: ExportRow[], format: "csv" | "pdf", label: string, period: string) {
  const recordedDates = rows.map((row) => formatDate(row.capturedAt));
  const timestamp = formatDate(Date.now());

  if (format === "csv") {
    const csv = toCsv(
      ["Student", "Email", "Course", "Section", "State", "Reason codes", "Recorded at"],
      rows.map((row, index) => [
        row.studentName,
        row.studentEmail,
        row.courseCode,
        row.sectionName,
        row.state,
        row.reasonCodes.join("; "),
        recordedDates[index],
      ]),
    );
    downloadBlob(new Blob([csv], { type: "text/csv" }), `sannidhi-attendance-report-${period}.csv`);
    return;
  }

  const pdf = renderReportPdf({
    title: "Sannidhi attendance report",
    subtitle: `${label} · generated ${timestamp}`,
    columns: ["Student", "Course", "Section", "State", "Reasons", "Recorded"],
    rows: rows.map((row, index) => [
      truncate(row.studentName),
      truncate(row.courseCode),
      truncate(row.sectionName),
      truncate(row.state),
      truncate(row.reasonCodes.join("; ")),
      truncate(recordedDates[index]),
    ]),
  });
  downloadBlob(
    new Blob([pdf as BlobPart], { type: "application/pdf" }),
    `sannidhi-attendance-report-${period}.pdf`,
  );
}

export function ExportButtons({
  rows,
  period,
  label,
}: {
  rows: ExportRow[];
  period: string;
  label: string;
}) {
  const disabled = rows.length === 0;
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        data-testid="export-csv"
        aria-label="Export report as CSV"
        title={disabled ? "No records to export in this window" : undefined}
        disabled={disabled}
        onClick={() => exportRows(rows, "csv", label, period)}
      >
        Export CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid="export-pdf"
        aria-label="Export report as PDF"
        title={disabled ? "No records to export in this window" : undefined}
        disabled={disabled}
        onClick={() => exportRows(rows, "pdf", label, period)}
      >
        Export PDF
      </Button>
    </div>
  );
}
