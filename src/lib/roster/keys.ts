import type { RosterRow } from "./types";

/**
 * Section identity across the roster pipeline: computeRosterDiff plans by
 * this key and applyRosterSync resolves section ids by the same key. The two
 * sides must never drift, so the helper lives here and is imported by both.
 */
export function sectionKey(
  courseCode: string,
  sectionName: string,
  term: string | undefined,
): string {
  return `${courseCode}\n${sectionName}\n${term ?? ""}`;
}

/** Enrollment identity for in-file dedupe and sync application. */
export function enrollmentKey(row: RosterRow): string {
  const term = row.term ?? "";
  return `${row.studentEmail}\n${row.courseCode}\n${row.sectionName}\n${term}`;
}
