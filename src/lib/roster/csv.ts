import type { ParsedRoster, RosterIssue, RosterRow } from "./types";
import { enrollmentKey } from "./keys";

export const ROSTER_CSV_HEADERS = [
  "department_code",
  "department_name",
  "course_code",
  "course_title",
  "section_name",
  "term",
  "student_email",
  "student_name",
  "usn",
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REQUIRED_COLUMNS = [
  "department_code",
  "department_name",
  "course_code",
  "course_title",
  "section_name",
  "student_email",
  "student_name",
] as const;

type RawRecord = {
  fields: string[];
  line: number;
};

type TokenizeResult = {
  records: RawRecord[];
  error: RosterIssue | null;
};

function tokenize(text: string): TokenizeResult {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let fieldWasQuoted = false;
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push(field);
    field = "";
    fieldWasQuoted = false;
  };

  const endRecord = () => {
    endField();
    if (fields.length > 1 || fields[0].length > 0) {
      records.push({ fields, line: recordLine });
    }
    fields = [];
    recordLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line += 1;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field.length === 0 && !fieldWasQuoted) {
        fieldWasQuoted = true;
        inQuotes = true;
      } else {
        return { records, error: { row: recordLine, field: "", message: "malformed quoting" } };
      }
      continue;
    }
    if (ch === ",") {
      endField();
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      line += 1;
      endRecord();
      continue;
    }
    field += ch;
  }

  if (inQuotes) {
    return { records, error: { row: recordLine, field: "", message: "unterminated quoted field" } };
  }
  endRecord();
  return { records, error: null };
}

/**
 * Parses an SIS/LMS roster extract into normalized rows. Invalid rows are
 * dropped and reported in issues (row numbers are 2-based, 1 being the header).
 */
export function parseRosterCsv(text: string): ParsedRoster {
  const rows: RosterRow[] = [];
  const issues: RosterIssue[] = [];

  const withoutBom = text.replace(/^\uFEFF/, "");
  const { records, error } = tokenize(withoutBom);
  if (error !== null) {
    // Malformed input: the records array may be truncated, so never parse it.
    return { rows, issues: [error] };
  }

  const header = records[0];
  if (header === undefined) {
    return { rows, issues };
  }

  const headerFields = header.fields.map((raw) => raw.trim().toLowerCase());
  const expected = [...ROSTER_CSV_HEADERS];
  const matches =
    headerFields.length === expected.length &&
    expected.every((column, index) => headerFields[index] === column);
  if (!matches) {
    issues.push({
      row: 1,
      field: "",
      message: `header mismatch: expected "${expected.join(",")}"`,
    });
    return { rows, issues };
  }

  const seenEnrollments = new Map<string, number>();

  for (const record of records.slice(1)) {
    const value = (index: number) => (record.fields[index] ?? "").trim();

    const fail = (field: string, message: string) =>
      issues.push({ row: record.line, field, message });

    const row: RosterRow = {
      departmentCode: value(0).toUpperCase(),
      departmentName: value(1),
      courseCode: value(2).toUpperCase(),
      courseTitle: value(3),
      sectionName: value(4),
      term: value(5).length > 0 ? value(5) : undefined,
      studentEmail: value(6).toLowerCase(),
      studentName: value(7),
      studentUsn: value(8).length > 0 ? value(8) : undefined,
    };

    if (Object.values(row).every((v) => v === undefined || (v as string).length === 0)) continue;

    let invalid = false;
    for (const column of REQUIRED_COLUMNS) {
      const raw = value(ROSTER_CSV_HEADERS.indexOf(column));
      if (raw.length === 0) {
        fail(column, `missing ${column}`);
        invalid = true;
      }
    }
    if (invalid) continue;

    if (!EMAIL_PATTERN.test(row.studentEmail)) {
      fail(
        "student_email",
        row.studentEmail.length === 0
          ? "missing student_email"
          : `invalid email "${row.studentEmail}"`,
      );
      continue;
    }

    const key = enrollmentKey(row);
    const firstRow = seenEnrollments.get(key);
    if (firstRow !== undefined) {
      fail(
        "student_email",
        `duplicate enrollment for "${row.studentEmail}" in ${row.courseCode} ${row.sectionName} (first seen on row ${firstRow})`,
      );
      continue;
    }
    seenEnrollments.set(key, record.line);

    rows.push(row);
  }

  return { rows, issues };
}
