import type { RosterIssue, RosterRow } from "../../src/lib/roster/types";

/** Row-count cap enforced by the rosterSync handlers, not by normalizeRosterRows. */
export const MAX_ROSTER_ROWS = 500;

function enrollmentKey(row: RosterRow): string {
  const term = row.term ?? "";
  return `${row.studentEmail}\n${row.courseCode}\n${row.sectionName}\n${term}`;
}

/**
 * Defensive re-normalization for rows that reached the sync API without going
 * through parseRosterCsv: trims every field, uppercases codes, lowercases
 * emails, treats empty term/usn as undefined, and collapses exact duplicate
 * enrollments. Issue row numbers are 1-based positions in the submitted
 * array. Row-count capping stays with the handlers; dropping empty rows stays
 * with computeRosterDiff.
 */
export function normalizeRosterRows(rows: RosterRow[]): {
  rows: RosterRow[];
  issues: RosterIssue[];
} {
  const normalized: RosterRow[] = [];
  const issues: RosterIssue[] = [];
  const firstSeenRow = new Map<string, number>();

  rows.forEach((raw, index) => {
    const row: RosterRow = {
      departmentCode: raw.departmentCode.trim().toUpperCase(),
      departmentName: raw.departmentName.trim(),
      courseCode: raw.courseCode.trim().toUpperCase(),
      courseTitle: raw.courseTitle.trim(),
      sectionName: raw.sectionName.trim(),
      ...(raw.term !== undefined && raw.term.trim().length > 0 ? { term: raw.term.trim() } : {}),
      studentEmail: raw.studentEmail.trim().toLowerCase(),
      studentName: raw.studentName.trim(),
      ...(raw.studentUsn !== undefined && raw.studentUsn.trim().length > 0
        ? { studentUsn: raw.studentUsn.trim() }
        : {}),
    };

    const key = enrollmentKey(row);
    const first = firstSeenRow.get(key);
    if (first !== undefined) {
      issues.push({
        row: index + 1,
        field: "student_email",
        message: `duplicate enrollment for "${row.studentEmail}" in ${row.courseCode} ${row.sectionName} (first seen on row ${first})`,
      });
      return;
    }
    firstSeenRow.set(key, index + 1);
    normalized.push(row);
  });

  return { rows: normalized, issues };
}
