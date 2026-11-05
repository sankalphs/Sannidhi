import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireActorUser } from "./lib/actor";
import { missedClassSessions } from "./lib/analytics_projection";
import { institutionDateKey } from "../src/lib/attendance/timezone";
import {
  projectAttendanceState,
  type AttendanceRecordState,
} from "../src/lib/attendance/projection";

// Day keys bucket events by the institution's calendar day (IST), so a
// 00:30 IST check-in lands on the day the student actually attended.
function dateKey(timestamp: number): string {
  return institutionDateKey(timestamp);
}

export const studentHistory = query({
  args: { actorToken: v.string(), studentId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    const subjectId = args.studentId ?? caller._id;

    if (caller._id !== subjectId) {
      if (caller.role !== "admin" && caller.role !== "auditor") {
        throw new ConvexError("unauthorized");
      }
      const subject = await ctx.db.get(subjectId);
      if (subject === null || subject.institutionId !== caller.institutionId) {
        throw new ConvexError("unauthorized");
      }
    }

    const events = await ctx.db
      .query("attendance_events")
      .withIndex("by_student_section", (q) => q.eq("studentId", subjectId))
      .collect();
    events.sort((a, b) => a.capturedAt - b.capturedAt);

    // One record per class session (latest event wins), matching analytics;
    // session-less events fall back to one record per day and section.
    const latestByKey = new Map<string, { dateKey: string; event: Doc<"attendance_events"> }>();
    for (const event of events) {
      const eventDateKey = dateKey(event.capturedAt);
      latestByKey.set(event.sessionId ?? `${eventDateKey}:${event.sectionId}`, {
        dateKey: eventDateKey,
        event,
      });
    }

    const sectionCache = new Map<
      Id<"sections">,
      { section: Doc<"sections">; course: Doc<"courses"> } | null
    >();
    async function loadSection(sectionId: Id<"sections">) {
      let cached = sectionCache.get(sectionId);
      if (cached === undefined) {
        const section = await ctx.db.get(sectionId);
        const course = section !== null ? await ctx.db.get(section.courseId) : null;
        cached = section !== null && course !== null ? { section, course } : null;
        sectionCache.set(sectionId, cached);
      }
      return cached;
    }

    const rows: Array<{
      dateKey: string;
      sectionId: Id<"sections">;
      courseId: Id<"courses">;
      courseCode: string;
      courseTitle: string;
      state: AttendanceRecordState;
      decidedAt: number;
      reasonCodes: string[];
    }> = [];

    for (const { dateKey, event } of latestByKey.values()) {
      const cached = await loadSection(event.sectionId);
      if (cached === null) continue;
      rows.push({
        dateKey,
        sectionId: event.sectionId,
        courseId: cached.course._id,
        courseCode: cached.course.code,
        courseTitle: cached.course.title,
        state: projectAttendanceState(event.state),
        decidedAt: event.capturedAt,
        reasonCodes: event.decision?.reasonCodes ?? [],
      });
    }

    for (const session of await missedClassSessions(ctx, { studentId: subjectId, events })) {
      const cached = await loadSection(session.sectionId);
      if (cached === null) continue;
      rows.push({
        dateKey: dateKey(session.startedAt),
        sectionId: session.sectionId,
        courseId: cached.course._id,
        courseCode: cached.course.code,
        courseTitle: cached.course.title,
        state: "absent",
        decidedAt: session.startedAt,
        reasonCodes: [],
      });
    }

    rows.sort(
      (a, b) => b.dateKey.localeCompare(a.dateKey) || a.courseCode.localeCompare(b.courseCode),
    );

    return rows;
  },
});
