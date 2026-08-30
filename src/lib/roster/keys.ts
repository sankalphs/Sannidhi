import type { RosterRow } from "./types";

/**
 * Section identity across the roster pipeline: computeRosterDiff plans by
 * this key and applyRosterSync resolves section ids by the same key. The two
 * sides must never drift, so the helper lives here and is imported by both.
 * Components are JSON-encoded as an ordered sequence so values containing
 * separators cannot collide with other rows' keys.
 */
export function sectionKey(
  courseCode: string,
  sectionName: string,
  term: string | undefined,
): string {
  return JSON.stringify([courseCode, sectionName, term ?? ""]);
}

/** Enrollment identity for in-file dedupe and sync application. */
export function enrollmentKey(row: RosterRow): string {
  return JSON.stringify([row.studentEmail, row.courseCode, row.sectionName, row.term ?? ""]);
}
