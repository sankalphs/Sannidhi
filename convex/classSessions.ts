import { ConvexError, v } from "convex/values";

import { decide, deviceTrustSignal, manualAttestationSignals } from "../src/lib/risk";
import {
  SESSION_CHALLENGE_ROTATION_HINT_MS,
  mintChallengeToken,
} from "../src/lib/session-challenge";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  appendAttendanceEvent,
  bestDeviceForStudent,
  latestEventsByStudentSince,
} from "./lib/attendance_event";
import { resolveActorUser } from "./lib/actor";
import { resolveSessionPolicy } from "./lib/policyContext";

const DEFAULT_WINDOW_MINUTES = 45;

const RECENT_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

type BoardRowState = "pending" | "challenged" | "verified" | "flagged" | "rejected";

const BOARD_STATE_RANK: Record<BoardRowState, number> = {
  verified: 0,
  challenged: 1,
  flagged: 2,
  pending: 3,
  rejected: 4,
};

export type ScheduleRow = {
  slotId: Id<"timetable_slots"> | null;
  sessionId: Id<"class_sessions"> | null;
  sessionStatus: "active" | "paused" | "closed" | null;
  courseId: Id<"courses">;
  courseCode: string;
  courseTitle: string;
  sectionId: Id<"sections">;
  sectionName: string;
  venueId: Id<"venues">;
  venueName: string;
  startMinutes: number;
  endMinutes: number;
  dayOfWeek: number;
  enrolledCount: number;
};

async function requireActorUser(
  ctx: MutationCtx | QueryCtx,
  actorToken: string,
): Promise<Doc<"users">> {
  const user = await resolveActorUser(ctx, actorToken).catch(() => null);
  if (user === null) throw new ConvexError("unauthorized");
  return user;
}

function requireFaculty(user: Doc<"users">): void {
  if (user.role !== "faculty") throw new ConvexError("unauthorized");
}

async function latestSessionForSection(
  ctx: MutationCtx | QueryCtx,
  sectionId: Id<"sections">,
): Promise<Doc<"class_sessions"> | null> {
  return ctx.db
    .query("class_sessions")
    .withIndex("by_section_started", (q) => q.eq("sectionId", sectionId))
    .order("desc")
    .first();
}

async function assertNoActiveSession(ctx: MutationCtx, sectionId: Id<"sections">): Promise<void> {
  const active = await ctx.db
    .query("class_sessions")
    .withIndex("by_section_started", (q) => q.eq("sectionId", sectionId))
    .filter((q) => q.eq(q.field("status"), "active"))
    .first();
  if (active !== null) throw new ConvexError("session_already_active");
}

async function requireOwnedSession(
  ctx: MutationCtx,
  actorToken: string,
  sessionId: Id<"class_sessions">,
): Promise<{ session: Doc<"class_sessions">; faculty: Doc<"users"> }> {
  const caller = await requireActorUser(ctx, actorToken);
  const session = await ctx.db.get(sessionId);
  if (session === null) throw new ConvexError("session not found");
  if (caller.role !== "faculty" || session.facultyId !== caller._id) {
    throw new ConvexError("unauthorized");
  }
  return { session, faculty: caller };
}

/** Institution-wide audit trail entry for a session lifecycle transition. */
async function appendSessionLedgerEvent(
  ctx: MutationCtx,
  args: {
    session: Doc<"class_sessions">;
    type: "session.paused" | "session.restarted" | "session.closed" | "session.auto_closed";
    actorUserId?: Id<"users">;
  },
): Promise<void> {
  await ctx.runMutation(internal.ledger.appendLedgerEvent, {
    institutionId: args.session.institutionId,
    category: "attendance",
    type: args.type,
    ...(args.actorUserId !== undefined ? { actorUserId: args.actorUserId } : {}),
    payload: { sessionId: args.session._id, sectionId: args.session.sectionId },
  });
}

function projectBoardState(state: Doc<"attendance_events">["state"]): BoardRowState {
  if (state === "session_verified" || state === "verified" || state === "corrected") {
    return "verified";
  }
  if (state === "step_up") return "challenged";
  if (state === "flagged") return "flagged";
  if (state === "rejected") return "rejected";
  return "pending";
}

export const listMySchedule = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<ScheduleRow[]> => {
    const caller = await requireActorUser(ctx, args.actorToken);
    requireFaculty(caller);
    const now = Date.now();
    const today = new Date().getDay();

    const slots = await ctx.db.query("timetable_slots").collect();
    const rows: ScheduleRow[] = [];

    for (const slot of slots) {
      if (slot.dayOfWeek !== today) continue;
      if (slot.facultyId !== undefined && slot.facultyId !== caller._id) continue;

      const section = await ctx.db.get(slot.sectionId);
      if (section === null) continue;
      const course = await ctx.db.get(section.courseId);
      if (course === null || course.institutionId !== caller.institutionId) continue;

      const [venue, latestSession, enrollments] = await Promise.all([
        ctx.db.get(slot.venueId),
        latestSessionForSection(ctx, slot.sectionId),
        ctx.db
          .query("enrollments")
          .withIndex("by_section", (q) => q.eq("sectionId", slot.sectionId))
          .collect(),
      ]);

      const recent =
        latestSession !== null && now - latestSession.startedAt <= RECENT_SESSION_WINDOW_MS
          ? latestSession
          : null;

      rows.push({
        slotId: slot._id,
        sessionId: recent?._id ?? null,
        sessionStatus: recent?.status ?? null,
        courseId: course._id,
        courseCode: course.code,
        courseTitle: course.title,
        sectionId: section._id,
        sectionName: section.name,
        venueId: slot.venueId,
        venueName: venue?.name ?? "",
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        dayOfWeek: slot.dayOfWeek,
        enrolledCount: enrollments.length,
      });
    }

    return rows.sort((a, b) => a.startMinutes - b.startMinutes);
  },
});

export const startFromSlot = mutation({
  args: {
    actorToken: v.string(),
    slotId: v.id("timetable_slots"),
    windowMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    requireFaculty(caller);

    const slot = await ctx.db.get(args.slotId);
    if (slot === null) throw new ConvexError("timetable slot not found");
    const section = await ctx.db.get(slot.sectionId);
    if (section === null) throw new ConvexError("section not found");
    const course = await ctx.db.get(section.courseId);
    if (course === null) throw new ConvexError("course not found");
    if (course.institutionId !== caller.institutionId) throw new ConvexError("unauthorized");

    await assertNoActiveSession(ctx, slot.sectionId);

    const now = Date.now();
    const sessionId = await ctx.db.insert("class_sessions", {
      institutionId: course.institutionId,
      courseId: course._id,
      sectionId: section._id,
      venueId: slot.venueId,
      facultyId: caller._id,
      kind: "scheduled",
      timetableSlotId: slot._id,
      status: "active",
      startedAt: now,
      windowEndsAt: now + (args.windowMinutes ?? DEFAULT_WINDOW_MINUTES) * 60_000,
    });

    if (slot.facultyId === undefined) {
      await ctx.db.patch(slot._id, { facultyId: caller._id });
    }

    return { sessionId };
  },
});

export const startGuest = mutation({
  args: {
    actorToken: v.string(),
    courseId: v.id("courses"),
    sectionId: v.id("sections"),
    venueId: v.id("venues"),
    windowMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    requireFaculty(caller);

    const section = await ctx.db.get(args.sectionId);
    if (section === null || section.courseId !== args.courseId) {
      throw new ConvexError("section does not belong to course");
    }
    const course = await ctx.db.get(args.courseId);
    if (course === null) throw new ConvexError("course not found");
    if (course.institutionId !== caller.institutionId) throw new ConvexError("unauthorized");
    const venue = await ctx.db.get(args.venueId);
    if (venue === null) throw new ConvexError("venue not found");
    if (venue.institutionId !== caller.institutionId) throw new ConvexError("unauthorized");

    await assertNoActiveSession(ctx, section._id);

    const now = Date.now();
    const sessionId = await ctx.db.insert("class_sessions", {
      institutionId: course.institutionId,
      courseId: course._id,
      sectionId: section._id,
      venueId: venue._id,
      facultyId: caller._id,
      kind: "guest",
      status: "active",
      startedAt: now,
      windowEndsAt: now + (args.windowMinutes ?? DEFAULT_WINDOW_MINUTES) * 60_000,
    });

    return { sessionId };
  },
});

export const pause = mutation({
  args: { actorToken: v.string(), sessionId: v.id("class_sessions") },
  handler: async (ctx, args) => {
    const { session, faculty } = await requireOwnedSession(ctx, args.actorToken, args.sessionId);
    if (session.status !== "active") throw new ConvexError("session_not_active");
    await ctx.db.patch(session._id, { status: "paused", pausedAt: Date.now() });
    await appendSessionLedgerEvent(ctx, {
      session,
      type: "session.paused",
      actorUserId: faculty._id,
    });
    return { status: "paused" as const };
  },
});

export const close = mutation({
  args: { actorToken: v.string(), sessionId: v.id("class_sessions") },
  handler: async (ctx, args) => {
    const { session, faculty } = await requireOwnedSession(ctx, args.actorToken, args.sessionId);
    if (session.status !== "active" && session.status !== "paused") {
      throw new ConvexError("session_already_closed");
    }
    await ctx.db.patch(session._id, { status: "closed", closedAt: Date.now() });
    await appendSessionLedgerEvent(ctx, {
      session,
      type: "session.closed",
      actorUserId: faculty._id,
    });
    return { status: "closed" as const };
  },
});

export const restart = mutation({
  args: {
    actorToken: v.string(),
    sessionId: v.id("class_sessions"),
    windowMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { session, faculty } = await requireOwnedSession(ctx, args.actorToken, args.sessionId);
    if (session.status !== "paused" && session.status !== "closed") {
      throw new ConvexError("session_not_restartable");
    }
    const now = Date.now();
    const windowEndsAt = now + (args.windowMinutes ?? DEFAULT_WINDOW_MINUTES) * 60_000;
    await ctx.db.patch(session._id, {
      status: "active",
      windowEndsAt,
      pausedAt: undefined,
      closedAt: undefined,
    });
    await appendSessionLedgerEvent(ctx, {
      session,
      type: "session.restarted",
      actorUserId: faculty._id,
    });
    return { status: "active" as const, windowEndsAt };
  },
});

export const publishChallenge = mutation({
  args: { actorToken: v.string(), sessionId: v.id("class_sessions") },
  handler: async (ctx, args) => {
    const { session } = await requireOwnedSession(ctx, args.actorToken, args.sessionId);
    const now = Date.now();
    if (session.status !== "active") throw new ConvexError("session_not_active");
    if (now >= session.windowEndsAt) throw new ConvexError("session_window_closed");

    const minted = await mintChallengeToken({
      sessionId: session._id,
      institutionId: session.institutionId,
      courseId: session.courseId,
      sectionId: session.sectionId,
      venueId: session.venueId,
      now,
    });

    await ctx.db.insert("session_challenges", {
      institutionId: session.institutionId,
      sessionId: session._id,
      nonceHash: minted.nonceHash,
      issuedAt: now,
      expiresAt: minted.expiresAt,
    });

    return {
      token: minted.token,
      expiresAt: minted.expiresAt,
      rotationHintMs: SESSION_CHALLENGE_ROTATION_HINT_MS,
    };
  },
});

export const getBoard = query({
  args: { actorToken: v.string(), sessionId: v.id("class_sessions") },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    const session = await ctx.db.get(args.sessionId);
    if (session === null) throw new ConvexError("session not found");
    const now = Date.now();

    const privileged =
      (caller.role === "admin" || caller.role === "auditor") &&
      caller.institutionId === session.institutionId;
    if (caller._id !== session.facultyId && !privileged) throw new ConvexError("unauthorized");

    const [course, section, venue] = await Promise.all([
      ctx.db.get(session.courseId),
      ctx.db.get(session.sectionId),
      ctx.db.get(session.venueId),
    ]);

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_section", (q) => q.eq("sectionId", session.sectionId))
      .collect();

    const latestByStudent = await latestEventsByStudentSince(ctx, {
      sectionId: session.sectionId,
      sessionId: session._id,
      sinceMs: session.startedAt,
    });

    const pendingChallenges = await ctx.db
      .query("verification_challenges")
      .withIndex("by_session_status", (q) => q.eq("sessionId", session._id).eq("status", "pending"))
      .collect();
    const challengeByStudent = new Map<
      Id<"users">,
      { kind: "checkin_stepup" | "spot_recheck"; expiresAt: number }
    >();
    for (const challenge of pendingChallenges) {
      if (challenge.expiresAt <= now) continue;
      challengeByStudent.set(challenge.studentId, {
        kind: challenge.kind,
        expiresAt: challenge.expiresAt,
      });
    }

    const rows: Array<{
      studentId: Id<"users">;
      studentName: string;
      email: string;
      state: BoardRowState;
      reasonCodes: string[];
      checkedInAt: number | null;
      challenge: { kind: "checkin_stepup" | "spot_recheck"; expiresAt: number } | null;
    }> = [];

    for (const enrollment of enrollments) {
      const student = await ctx.db.get(enrollment.studentId);
      if (student === null) continue;
      const latest = latestByStudent.get(enrollment.studentId);
      rows.push({
        studentId: student._id,
        studentName: student.name,
        email: student.email,
        state: latest !== undefined ? projectBoardState(latest.state) : "pending",
        reasonCodes: latest?.decision?.reasonCodes ?? [],
        checkedInAt: latest !== undefined ? latest.capturedAt : null,
        challenge: challengeByStudent.get(enrollment.studentId) ?? null,
      });
    }

    rows.sort(
      (a, b) =>
        BOARD_STATE_RANK[a.state] - BOARD_STATE_RANK[b.state] ||
        a.studentName.localeCompare(b.studentName),
    );

    return {
      session: {
        sessionId: session._id,
        status: session.status,
        kind: session.kind,
        courseCode: course?.code ?? "",
        courseTitle: course?.title ?? "",
        sectionName: section?.name ?? "",
        venueName: venue?.name ?? "",
        startedAt: session.startedAt,
        windowEndsAt: session.windowEndsAt,
      },
      rows,
    };
  },
});

export const verifyManually = mutation({
  args: {
    actorToken: v.string(),
    sessionId: v.id("class_sessions"),
    studentId: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    const { session } = await requireOwnedSession(ctx, args.actorToken, args.sessionId);

    const trimmed = args.reason.trim();
    if (trimmed.length < 10) throw new ConvexError("reason_too_short");

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .filter((q) => q.eq(q.field("sectionId"), session.sectionId))
      .first();
    if (enrollment === null) throw new ConvexError("student_not_enrolled");

    const now = Date.now();

    // Idempotent only when the student's LATEST event is already verified; an
    // older verified event must not swallow overrides of newer flagged/rejected
    // states.
    const latestEvent = (
      await latestEventsByStudentSince(ctx, {
        sectionId: session.sectionId,
        sessionId: session._id,
        sinceMs: session.startedAt,
      })
    ).get(args.studentId);
    if (latestEvent !== undefined && latestEvent.state === "verified") {
      return { ok: true as const, decision: latestEvent.decision ?? null };
    }

    const device = await bestDeviceForStudent(ctx, args.studentId);
    const decision = decide({
      signals: [...manualAttestationSignals(trimmed), deviceTrustSignal(device)],
      anomalies: { recentSecurityFailures: 0 },
      now,
      policy: await resolveSessionPolicy(ctx, session),
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: session.institutionId,
      category: "attendance",
      type: "attendance.manual_verified",
      actorUserId: caller._id,
      subjectUserId: args.studentId,
      payload: { sessionId: session._id, studentId: args.studentId, reason: trimmed, decision },
    });

    await appendAttendanceEvent(ctx, {
      institutionId: session.institutionId,
      studentId: args.studentId,
      sectionId: session.sectionId,
      sessionId: session._id,
      state: "verified",
      decision,
      recordedByUserId: caller._id,
      note: trimmed,
    });

    return { ok: true as const, decision };
  },
});

export const listSessionOptions = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    requireFaculty(caller);

    const courses = (
      await ctx.db
        .query("courses")
        .withIndex("by_institution_code", (q) => q.eq("institutionId", caller.institutionId))
        .collect()
    ).sort((a, b) => a.code.localeCompare(b.code));

    const venues = (
      await ctx.db
        .query("venues")
        .withIndex("by_institution", (q) => q.eq("institutionId", caller.institutionId))
        .collect()
    ).sort((a, b) => a.name.localeCompare(b.name));

    const sections: Array<{ id: Id<"sections">; label: string; courseId: Id<"courses"> }> = [];
    for (const course of courses) {
      const courseSections = await ctx.db
        .query("sections")
        .withIndex("by_course", (q) => q.eq("courseId", course._id))
        .collect();
      for (const section of courseSections.sort((a, b) => a.name.localeCompare(b.name))) {
        sections.push({ id: section._id, label: section.name, courseId: course._id });
      }
    }

    return {
      courses: courses.map((course) => ({
        id: course._id,
        label: `${course.code} - ${course.title}`,
      })),
      sections,
      venues: venues.map((venue) => ({ id: venue._id, label: venue.name })),
    };
  },
});
