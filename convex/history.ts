import { ConvexError, v } from "convex/values";

import type { AttendanceRecordState } from "../src/lib/attendance/projection";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { resolveActorUser } from "./lib/actor";

const UTC_DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function utcDateKey(timestamp: number): string {
  return UTC_DATE_KEY_FORMATTER.format(timestamp);
}

function projectHistoryState(state: Doc<"attendance_events">["state"]): AttendanceRecordState {
  if (state === "session_verified" || state === "verified") return "verified";
  if (state === "flagged" || state === "rejected" || state === "corrected") return state;
  return "pending";
}

async function requireActorUser(ctx: QueryCtx, actorToken: string): Promise<Doc<"users">> {
  const user = await resolveActorUser(ctx, actorToken).catch(() => null);
  if (user === null) throw new ConvexError("unauthorized");
  return user;
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

    const latestByKey = new Map<string, { dateKey: string; event: Doc<"attendance_events"> }>();
    for (const event of events) {
      latestByKey.set(`${utcDateKey(event.capturedAt)}:${event.sectionId}`, {
        dateKey: utcDateKey(event.capturedAt),
        event,
      });
    }

    const sectionCache = new Map<
      Id<"sections">,
      { section: Doc<"sections"> | null; course: Doc<"courses"> | null }
    >();

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
      let cached = sectionCache.get(event.sectionId);
      if (cached === undefined) {
        const section = await ctx.db.get(event.sectionId);
        const course = section !== null ? await ctx.db.get(section.courseId) : null;
        cached = { section, course };
        sectionCache.set(event.sectionId, cached);
      }
      if (cached.section === null || cached.course === null) continue;
      rows.push({
        dateKey,
        sectionId: event.sectionId,
        courseId: cached.course._id,
        courseCode: cached.course.code,
        courseTitle: cached.course.title,
        state: projectHistoryState(event.state),
        decidedAt: event.capturedAt,
        reasonCodes: event.decision?.reasonCodes ?? [],
      });
    }

    rows.sort(
      (a, b) => b.dateKey.localeCompare(a.dateKey) || a.courseCode.localeCompare(b.courseCode),
    );

    return rows;
  },
});
