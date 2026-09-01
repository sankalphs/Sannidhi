import { ConvexError, v } from "convex/values";

import { buildCorrectionDecision, foldCorrectionNote } from "../src/lib/attendance/correction";
import { CORRECTIONABLE_STATES, type AttendanceEventState } from "../src/lib/attendance/lifecycle";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { appendAttendanceEvent } from "./lib/attendance_event";
import { requireActorUserWithActiveSession } from "./lib/actor";

const MAX_REASON_LENGTH = 1000;
const MIN_REASON_LENGTH = 10;
const MAX_LISTED_REQUESTS = 50;
const MAX_PENDING_REQUESTS = 10;
const MAX_LISTED_CORRECTIONABLE_EVENTS = 30;

const requestTypeValidator = v.union(
  v.literal("correction"),
  v.literal("exemption"),
  v.literal("on_duty"),
);

const requestStatusValidator = v.union(
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("dismissed"),
);

function isCorrectionableState(state: AttendanceEventState): boolean {
  return (CORRECTIONABLE_STATES as readonly string[]).includes(state);
}

async function requireStudent(
  ctx: MutationCtx | QueryCtx,
  actorToken: string,
): Promise<Doc<"users">> {
  const user = await requireActorUserWithActiveSession(ctx, actorToken).catch(() => null);
  if (user === null) throw new ConvexError("unauthorized");
  if (user.role !== "student") throw new ConvexError("unauthorized");
  return user;
}

/** Reviewers are the session's recording faculty; admins may act as fallback. */
async function requireReviewer(
  ctx: MutationCtx | QueryCtx,
  actorToken: string,
): Promise<Doc<"users">> {
  const user = await requireActorUserWithActiveSession(ctx, actorToken).catch(() => null);
  if (user === null) throw new ConvexError("unauthorized");
  if (user.role !== "faculty" && user.role !== "admin") throw new ConvexError("unauthorized");
  return user;
}

/**
 * Ownership + correctionability gate for a disputed event. Returns the event's
 * sessionId so the request can be routed to the faculty who recorded it.
 */
async function requireDisputableEvent(
  ctx: MutationCtx,
  student: Doc<"users">,
  eventId: Id<"attendance_events">,
): Promise<Id<"class_sessions">> {
  const event = await ctx.db.get(eventId);
  if (event === null) throw new ConvexError("That attendance record no longer exists.");
  if (event.studentId !== student._id) throw new ConvexError("unauthorized");
  if (!isCorrectionableState(event.state)) {
    throw new ConvexError("That record is not in a state that can be corrected.");
  }
  if (event.sessionId === undefined) {
    throw new ConvexError("That record has no class session attached and cannot be disputed.");
  }

  const priorCorrection = await ctx.db
    .query("attendance_events")
    .withIndex("by_corrects_event", (q) => q.eq("correctsEventId", eventId))
    .first();
  if (priorCorrection !== null) {
    throw new ConvexError("That record has already been corrected.");
  }

  const openRequests = await ctx.db
    .query("attendance_requests")
    .withIndex("by_student_status_requested", (q) =>
      q.eq("studentId", student._id).eq("status", "submitted"),
    )
    .collect();
  const alreadyDisputed = openRequests.some(
    (request) => request.type === "correction" && request.eventId === eventId,
  );
  if (alreadyDisputed) throw new ConvexError("You already have an open dispute for this record.");

  return event.sessionId;
}

export const submitMyRequest = mutation({
  args: {
    actorToken: v.string(),
    type: requestTypeValidator,
    reason: v.string(),
    eventId: v.optional(v.id("attendance_events")),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const caller = await requireStudent(ctx, args.actorToken);

    const reason = args.reason.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      throw new ConvexError(`Reason must be at least ${MIN_REASON_LENGTH} characters`);
    }
    if (reason.length > MAX_REASON_LENGTH) {
      throw new ConvexError(`Reason is limited to ${MAX_REASON_LENGTH} characters`);
    }

    let sessionId: Id<"class_sessions"> | undefined;
    if (args.type === "correction") {
      if (args.eventId === undefined) {
        throw new ConvexError("Select the attendance record you want to dispute.");
      }
      sessionId = await requireDisputableEvent(ctx, caller, args.eventId);
    }

    const pending = await ctx.db
      .query("attendance_requests")
      .withIndex("by_student_status_requested", (q) =>
        q.eq("studentId", caller._id).eq("status", "submitted"),
      )
      .take(MAX_PENDING_REQUESTS + 1);
    if (pending.length >= MAX_PENDING_REQUESTS) {
      throw new ConvexError(
        `You already have ${MAX_PENDING_REQUESTS} open requests. Wait until they are reviewed.`,
      );
    }

    const requestedAt = Date.now();
    await ctx.db.insert("attendance_requests", {
      institutionId: caller.institutionId,
      studentId: caller._id,
      type: args.type,
      reason,
      status: "submitted",
      requestedAt,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(args.eventId !== undefined ? { eventId: args.eventId } : {}),
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "attendance",
      type: "attendance_request_filed",
      actorUserId: caller._id,
      subjectUserId: caller._id,
      payload: { requestType: args.type },
    });

    return { ok: true };
  },
});

/** The student's recent still-correctionable records — the dispute picker's options. */
export const listMyCorrectionableEvents = query({
  args: { actorToken: v.string() },
  returns: v.array(
    v.object({
      eventId: v.id("attendance_events"),
      courseCode: v.string(),
      capturedAt: v.number(),
      state: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const caller = await requireStudent(ctx, args.actorToken);

    const events = await ctx.db
      .query("attendance_events")
      .withIndex("by_student_section", (q) => q.eq("studentId", caller._id))
      .collect();
    events.sort((a, b) => b.capturedAt - a.capturedAt);

    const openRequests = await ctx.db
      .query("attendance_requests")
      .withIndex("by_student_status_requested", (q) =>
        q.eq("studentId", caller._id).eq("status", "submitted"),
      )
      .collect();
    const disputedEventIds = new Set(
      openRequests.filter((request) => request.type === "correction").map((r) => r.eventId),
    );

    const courseCodeBySection = new Map<Id<"sections">, string>();
    const rows: Array<{
      eventId: Id<"attendance_events">;
      courseCode: string;
      capturedAt: number;
      state: string;
    }> = [];

    for (const event of events) {
      if (rows.length >= MAX_LISTED_CORRECTIONABLE_EVENTS) break;
      if (!isCorrectionableState(event.state)) continue;
      if (disputedEventIds.has(event._id)) continue;

      const priorCorrection = await ctx.db
        .query("attendance_events")
        .withIndex("by_corrects_event", (q) => q.eq("correctsEventId", event._id))
        .first();
      if (priorCorrection !== null) continue;

      let courseCode = courseCodeBySection.get(event.sectionId);
      if (courseCode === undefined) {
        const section = await ctx.db.get(event.sectionId);
        const course = section !== null ? await ctx.db.get(section.courseId) : null;
        courseCode = course?.code ?? "";
        courseCodeBySection.set(event.sectionId, courseCode);
      }

      rows.push({
        eventId: event._id,
        courseCode,
        capturedAt: event.capturedAt,
        state: event.state,
      });
    }

    return rows;
  },
});

/**
 * Correction disputes waiting for review. Faculty see requests routed to them
 * via the recording session's facultyId; admins see everything in their
 * institution. Each row carries the disputed event's current verdict so the
 * reviewer sees the previous state without leaving the queue.
 */
export const listReviewQueue = query({
  args: { actorToken: v.string() },
  returns: v.array(
    v.object({
      requestId: v.id("attendance_requests"),
      studentName: v.string(),
      reason: v.string(),
      requestedAt: v.number(),
      sessionId: v.id("class_sessions"),
      courseCode: v.string(),
      sectionName: v.string(),
      sessionStartedAt: v.number(),
      eventId: v.id("attendance_events"),
      previousState: v.string(),
      previousReasonCodes: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const caller = await requireReviewer(ctx, args.actorToken);

    const submitted = await ctx.db
      .query("attendance_requests")
      .withIndex("by_institution_status", (q) =>
        q.eq("institutionId", caller.institutionId).eq("status", "submitted"),
      )
      .collect();

    const rows: Array<{
      requestId: Id<"attendance_requests">;
      studentName: string;
      reason: string;
      requestedAt: number;
      sessionId: Id<"class_sessions">;
      courseCode: string;
      sectionName: string;
      sessionStartedAt: number;
      eventId: Id<"attendance_events">;
      previousState: string;
      previousReasonCodes: string[];
    }> = [];

    for (const request of submitted) {
      if (request.type !== "correction") continue;
      if (request.sessionId === undefined || request.eventId === undefined) continue;

      const [session, event, student] = await Promise.all([
        ctx.db.get(request.sessionId),
        ctx.db.get(request.eventId),
        ctx.db.get(request.studentId),
      ]);
      if (session === null || event === null || student === null) continue;
      if (caller.role === "faculty" && session.facultyId !== caller._id) continue;

      const section = await ctx.db.get(session.sectionId);
      const course = await ctx.db.get(session.courseId);

      rows.push({
        requestId: request._id,
        studentName: student.name,
        reason: request.reason,
        requestedAt: request.requestedAt,
        sessionId: session._id,
        courseCode: course?.code ?? "",
        sectionName: section?.name ?? "",
        sessionStartedAt: session.startedAt,
        eventId: event._id,
        previousState: event.state,
        previousReasonCodes: event.decision?.reasonCodes ?? [],
      });
    }

    rows.sort((a, b) => a.requestedAt - b.requestedAt);
    return rows;
  },
});

/**
 * Faculty/admin decision on a submitted request. Approval appends a
 * "corrected" attendance event referencing the original — history is never
 * rewritten — and both outcomes stamp reviewer identity/time plus an audit
 * ledger entry.
 */
export const reviewRequest = mutation({
  args: {
    actorToken: v.string(),
    requestId: v.id("attendance_requests"),
    decision: v.union(v.literal("approved"), v.literal("dismissed")),
    note: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const reviewer = await requireReviewer(ctx, args.actorToken);

    const request = await ctx.db.get(args.requestId);
    if (request === null) throw new ConvexError("request_not_found");
    if (request.institutionId !== reviewer.institutionId) throw new ConvexError("unauthorized");
    if (request.status !== "submitted") throw new ConvexError("request_already_reviewed");

    if (reviewer.role === "faculty") {
      if (request.sessionId === undefined) throw new ConvexError("unauthorized");
      const session = await ctx.db.get(request.sessionId);
      if (session === null || session.facultyId !== reviewer._id) {
        throw new ConvexError("unauthorized");
      }
    }

    const reviewedAt = Date.now();

    if (args.decision === "dismissed") {
      await ctx.db.patch(request._id, {
        status: "dismissed",
        reviewedAt,
        reviewedByUserId: reviewer._id,
        decision: "dismissed",
      });
      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: request.institutionId,
        category: "attendance",
        type: "attendance_request_reviewed",
        actorUserId: reviewer._id,
        subjectUserId: request.studentId,
        payload: {
          requestId: request._id,
          decision: "dismissed",
          ...(request.eventId !== undefined
            ? { eventId: request.eventId, previousState: null }
            : {}),
        },
      });
      return { ok: true };
    }

    if (request.eventId === undefined || request.sessionId === undefined) {
      throw new ConvexError("request_missing_event_link");
    }
    const eventId = request.eventId;
    const event = await ctx.db.get(eventId);
    if (event === null) throw new ConvexError("event_not_found");
    if (!isCorrectionableState(event.state)) throw new ConvexError("event_not_correctionable");
    if (event.sessionId === undefined) throw new ConvexError("event_has_no_session");

    // Re-check before writing so a race with another reviewer fails cleanly;
    // appendAttendanceEvent re-validates inside the same transaction anyway.
    const priorCorrection = await ctx.db
      .query("attendance_events")
      .withIndex("by_corrects_event", (q) => q.eq("correctsEventId", eventId))
      .first();
    if (priorCorrection !== null) throw new ConvexError("event_already_corrected");

    await ctx.db.patch(request._id, {
      status: "approved",
      reviewedAt,
      reviewedByUserId: reviewer._id,
      decision: "approved",
    });

    await appendAttendanceEvent(ctx, {
      institutionId: request.institutionId,
      studentId: request.studentId,
      sectionId: event.sectionId,
      sessionId: event.sessionId,
      state: "corrected",
      origin: "online",
      correctsEventId: eventId,
      decision: buildCorrectionDecision(event.decision, { decidedAt: reviewedAt }),
      recordedByUserId: reviewer._id,
      note: foldCorrectionNote(request.reason, args.note),
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: request.institutionId,
      category: "attendance",
      type: "attendance_request_reviewed",
      actorUserId: reviewer._id,
      subjectUserId: request.studentId,
      payload: {
        requestId: request._id,
        decision: "approved",
        eventId,
        previousState: event.state,
      },
    });

    return { ok: true };
  },
});

export const listMyRequests = query({
  args: { actorToken: v.string() },
  returns: v.array(
    v.object({
      id: v.id("attendance_requests"),
      type: requestTypeValidator,
      reason: v.string(),
      status: requestStatusValidator,
      requestedAt: v.number(),
      reviewedAt: v.optional(v.number()),
      eventId: v.optional(v.id("attendance_events")),
      courseCode: v.optional(v.string()),
      sessionStartedAt: v.optional(v.number()),
      disputedState: v.optional(v.string()),
      correctionEventId: v.optional(v.id("attendance_events")),
    }),
  ),
  handler: async (ctx, args) => {
    const caller = await requireStudent(ctx, args.actorToken);
    const requests = await ctx.db
      .query("attendance_requests")
      .withIndex("by_student_requested", (q) => q.eq("studentId", caller._id))
      .order("desc")
      .take(MAX_LISTED_REQUESTS);

    const rows: Array<{
      id: Id<"attendance_requests">;
      type: "correction" | "exemption" | "on_duty";
      reason: string;
      status: "submitted" | "approved" | "dismissed";
      requestedAt: number;
      reviewedAt?: number;
      eventId?: Id<"attendance_events">;
      courseCode?: string;
      sessionStartedAt?: number;
      disputedState?: string;
      correctionEventId?: Id<"attendance_events">;
    }> = [];
    for (const request of requests) {
      const base = {
        id: request._id,
        type: request.type,
        reason: request.reason,
        status: request.status,
        requestedAt: request.requestedAt,
        reviewedAt: request.reviewedAt,
      };
      if (request.eventId === undefined) {
        rows.push(base);
        continue;
      }

      const eventId = request.eventId;
      const event = await ctx.db.get(eventId);
      const section = event !== null ? await ctx.db.get(event.sectionId) : null;
      const course = section !== null ? await ctx.db.get(section.courseId) : null;
      const session = request.sessionId !== undefined ? await ctx.db.get(request.sessionId) : null;
      const correction = await ctx.db
        .query("attendance_events")
        .withIndex("by_corrects_event", (q) => q.eq("correctsEventId", eventId))
        .first();

      rows.push({
        ...base,
        eventId,
        ...(course !== null ? { courseCode: course.code } : {}),
        ...(session !== null ? { sessionStartedAt: session.startedAt } : {}),
        ...(event !== null ? { disputedState: event.state } : {}),
        ...(correction !== null ? { correctionEventId: correction._id } : {}),
      });
    }
    return rows;
  },
});
