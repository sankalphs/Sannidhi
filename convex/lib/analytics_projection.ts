import { projectAttendanceState } from "../../src/lib/attendance/projection";
import type { TrajectoryRecord } from "../../src/lib/analytics/trajectory";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Single source of truth for trajectory records: a student's own attendance
 * events projected to record states, plus synthesized "absent" records for
 * closed sessions of enrolled sections where the student left no event.
 * Open or paused sessions never count as absences — only settled classes do.
 */
export async function studentTrajectoryRecords(
  ctx: QueryCtx,
  args: { studentId: Id<"users"> },
): Promise<TrajectoryRecord[]> {
  const events = await ctx.db
    .query("attendance_events")
    .withIndex("by_student_section", (q) => q.eq("studentId", args.studentId))
    .collect();

  const records: TrajectoryRecord[] = events.map((event) => ({
    state: projectAttendanceState(event.state),
    capturedAt: event.capturedAt,
  }));

  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
    .collect();

  const earliestEventMs =
    events.length > 0 ? Math.min(...events.map((event) => event.capturedAt)) : null;

  for (const enrollment of enrollments) {
    const sessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_section_started", (q) => q.eq("sectionId", enrollment.sectionId))
      .collect();
    for (const session of sessions) {
      if (session.status !== "closed") continue;
      if (earliestEventMs !== null && session.startedAt < earliestEventMs) continue;
      const attended = events.some(
        (event) => event.sessionId !== undefined && event.sessionId === session._id,
      );
      if (!attended) {
        records.push({ state: "absent", capturedAt: session.startedAt });
      }
    }
  }

  return records;
}

/** Loads a student's flagged decision events within the proxy lookback window. */
export async function flaggedEventsForStudent(
  ctx: QueryCtx,
  args: { studentId: Id<"users">; sinceMs: number },
): Promise<Array<Doc<"attendance_events">>> {
  const events = await ctx.db
    .query("attendance_events")
    .withIndex("by_student_section", (q) => q.eq("studentId", args.studentId))
    .collect();
  return events.filter(
    (event) =>
      event.state === "flagged" && event.decision !== undefined && event.capturedAt >= args.sinceMs,
  );
}
