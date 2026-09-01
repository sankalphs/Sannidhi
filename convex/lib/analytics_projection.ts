import { projectAttendanceState } from "../../src/lib/attendance/projection";
import type { TrajectoryRecord } from "../../src/lib/analytics/trajectory";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Resolves one attendance record per (session, student): of all the events a
 * student generated for a session, only the latest counts. A check-in that
 * lands step_up then verified is one record, not two; a spot-recheck that
 * flips a verified record to flagged is still that same one record. Ties on
 * capturedAt break by seq — the per-institution chain counter — so the
 * resolved record is deterministic regardless of collection order.
 */
export function latestEventBySession(
  events: Array<Doc<"attendance_events">>,
): Map<Id<"class_sessions">, Doc<"attendance_events">> {
  const latest = new Map<Id<"class_sessions">, Doc<"attendance_events">>();
  for (const event of events) {
    if (event.sessionId === undefined) continue;
    const current = latest.get(event.sessionId);
    if (
      current === undefined ||
      event.capturedAt > current.capturedAt ||
      (event.capturedAt === current.capturedAt && event.seq > current.seq)
    ) {
      latest.set(event.sessionId, event);
    }
  }
  return latest;
}

/**
 * Single source of truth for trajectory records: a student's own attendance
 * events resolved to one record per session, plus synthesized "absent"
 * records for closed sessions of enrolled sections where the student left
 * no event. Synthesis starts at each enrollment's own start — sessions
 * before a student joined a section never count as that student's absences —
 * and open or paused sessions never count; only settled classes do.
 */
export async function studentTrajectoryRecords(
  ctx: QueryCtx,
  args: { studentId: Id<"users"> },
): Promise<TrajectoryRecord[]> {
  const events = await ctx.db
    .query("attendance_events")
    .withIndex("by_student_section", (q) => q.eq("studentId", args.studentId))
    .collect();

  const records: TrajectoryRecord[] = [...latestEventBySession(events).values()].map((event) => ({
    state: projectAttendanceState(event.state),
    capturedAt: event.capturedAt,
  }));

  const enrollments = await ctx.db
    .query("enrollments")
    .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
    .collect();

  for (const enrollment of enrollments) {
    const sessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_section_started", (q) => q.eq("sectionId", enrollment.sectionId))
      .collect();
    for (const session of sessions) {
      if (session.status !== "closed") continue;
      if (session.startedAt < enrollment.enrolledAt) continue;
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
