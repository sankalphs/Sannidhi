import { ConvexError, v } from "convex/values";

import type { Decision } from "../src/lib/decision";
import {
  challengePresenceSignal,
  decide,
  deviceTrustSignal,
  evaluateLocationConsistency,
  failurePresenceSignal,
  geolocationSignal,
  identitySessionSignal,
  outcomeToAttendanceState,
  type AttendanceState,
} from "../src/lib/risk";
import {
  classifyRedeem,
  nonceDigest,
  verifyChallengeToken,
  type RedeemVerdict,
  type SessionContextState,
} from "../src/lib/session-challenge";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { MAX_CHALLENGE_ATTEMPTS, STEPUP_CHALLENGE_TTL_MS } from "./challenges";
import {
  appendAttendanceEvent,
  bestDeviceForStudent,
  CHECKIN_RATE_LIMIT_MAX_ATTEMPTS,
  CHECKIN_RATE_LIMIT_WINDOW_MS,
  countRecentChallengeAnomalies,
  countRecentCheckinAttempts,
  latestEventsByStudentSince,
  RATE_LIMIT_EVENT_TYPES,
} from "./lib/attendance_event";
import { requireActorUser } from "./lib/actor";
import { resolveSessionPolicy } from "./lib/policyContext";

type FailureVerdict = Exclude<RedeemVerdict, "valid">;

type SecurityEventType = (typeof RATE_LIMIT_EVENT_TYPES)[number];

/** Terminal decision states: once landed, a session's outcome is settled. */
const DECISION_EVENT_STATES = ["step_up", "verified", "flagged", "rejected"] as const;

function isDecisionEventState(state: string): state is (typeof DECISION_EVENT_STATES)[number] {
  return (DECISION_EVENT_STATES as readonly string[]).includes(state);
}

const FAILURE_EVENT_TYPES: Record<FailureVerdict, SecurityEventType> = {
  expired: "challenge_expired_use",
  malformed: "malformed_challenge",
  replayed: "challenge_replayed",
  wrong_session: "wrong_session_challenge",
};

export const getActiveForStudent = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    if (caller.role !== "student") throw new ConvexError("unauthorized");
    const now = Date.now();

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_student", (q) => q.eq("studentId", caller._id))
      .collect();

    let activeSession: Doc<"class_sessions"> | null = null;
    for (const enrollment of enrollments) {
      const latest = await ctx.db
        .query("class_sessions")
        .withIndex("by_section_started", (q) => q.eq("sectionId", enrollment.sectionId))
        .order("desc")
        .first();
      if (latest === null || latest.status !== "active" || latest.windowEndsAt <= now) continue;
      if (activeSession === null || latest.startedAt > activeSession.startedAt) {
        activeSession = latest;
      }
    }

    if (activeSession === null) return null;

    const [course, section, venue] = await Promise.all([
      ctx.db.get(activeSession.courseId),
      ctx.db.get(activeSession.sectionId),
      ctx.db.get(activeSession.venueId),
    ]);

    return {
      sessionId: activeSession._id,
      courseCode: course?.code ?? "",
      courseTitle: course?.title ?? "",
      sectionName: section?.name ?? "",
      venueName: venue?.name ?? "",
      windowEndsAt: activeSession.windowEndsAt,
    };
  },
});

type RedeemFailure =
  | { kind: "failed"; verdict: FailureVerdict; reasonCodes: string[] }
  | { kind: "rate_limited"; retryAfterSeconds: number };

type StepUpChallengeRef = {
  _id: Id<"verification_challenges">;
  expiresAt: number;
  maxAttempts: number;
};

type RedeemResult =
  | ({
      kind: "ok";
      attendanceEventId: Id<"attendance_events">;
      state: AttendanceState;
      checkedInAt: number;
      courseCode: string;
      venueName: string;
    } & Decision)
  | ({
      kind: "step_up";
      challenge: StepUpChallengeRef;
      courseCode: string;
      venueName: string;
    } & Decision)
  | RedeemFailure;

export const redeemChallenge = mutation({
  args: {
    actorToken: v.string(),
    token: v.string(),
    location: v.optional(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        accuracyMeters: v.optional(v.number()),
        capturedAt: v.optional(v.number()),
      }),
    ),
    locationConsent: v.optional(
      v.union(v.literal("granted"), v.literal("denied"), v.literal("not_requested")),
    ),
    locationAvailability: v.optional(v.union(v.literal("ok"), v.literal("unavailable"))),
  },
  handler: async (ctx, args): Promise<RedeemResult> => {
    const caller = await requireActorUser(ctx, args.actorToken);
    const now = Date.now();

    const fail = (failure: RedeemFailure): RedeemResult => failure;

    let session: Doc<"class_sessions"> | null = null;

    const appendFailure = async (
      verdict: FailureVerdict,
      reasonCodes: string[],
      nonceHash?: string,
      sessionId?: Id<"class_sessions">,
    ) => {
      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: caller.institutionId,
        category: "attendance",
        type: FAILURE_EVENT_TYPES[verdict],
        actorUserId: caller._id,
        subjectUserId: caller._id,
        payload: {
          verdict,
          reasonCodes,
          ...(nonceHash !== undefined ? { nonceHash } : {}),
          ...(sessionId !== undefined ? { sessionId } : {}),
        },
      });
      if ((verdict === "replayed" || verdict === "wrong_session") && session !== null) {
        await recordRejectedDecision(verdict);
      }
    };

    const recordRejectedDecision = async (verdict: FailureVerdict): Promise<void> => {
      if (session === null) return;
      const device = await bestDeviceForStudent(ctx, caller._id);
      const recentSecurityFailures = await countRecentChallengeAnomalies(ctx, {
        studentId: caller._id,
        now,
      });
      const decision: Decision = decide({
        signals: [
          identitySessionSignal(),
          deviceTrustSignal(device),
          failurePresenceSignal(verdict),
        ],
        anomalies: { recentSecurityFailures },
        now,
        policy: await resolveSessionPolicy(ctx, session),
      });
      if (decision.outcome !== "reject") return;
      await appendAttendanceEvent(ctx, {
        institutionId: session.institutionId,
        studentId: caller._id,
        sectionId: session.sectionId,
        sessionId: session._id,
        state: outcomeToAttendanceState(decision.outcome),
        decision,
      });
    };

    const verified = await verifyChallengeToken(args.token);
    if (!verified.ok) {
      // Authorization precedes every failure write: a non-student or a caller
      // from another institution gets a silent verdict, never ledger rows in
      // the victim institution's chain.
      if (caller.role !== "student") {
        return fail({ kind: "failed", verdict: "wrong_session", reasonCodes: ["not_enrolled"] });
      }
      const attempts = await countRecentCheckinAttempts(ctx, { studentId: caller._id, now });
      if (attempts >= CHECKIN_RATE_LIMIT_MAX_ATTEMPTS) {
        return { kind: "rate_limited", retryAfterSeconds: 60 };
      }
      const reasonCodes = [verified.reasonCode];
      await appendFailure("malformed", reasonCodes);
      return fail({ kind: "failed", verdict: "malformed", reasonCodes });
    }

    const payload = verified.payload;
    try {
      session = await ctx.db.get(payload.sid as Id<"class_sessions">);
    } catch {
      session = null;
    }

    // Cross-tenant gate before any write: the caller's institution must match
    // the token's institution. Foreign callers learn nothing and write nothing.
    if (session === null || caller.institutionId !== session.institutionId) {
      if (caller.role !== "student") {
        return fail({ kind: "failed", verdict: "wrong_session", reasonCodes: ["not_enrolled"] });
      }
      return fail({ kind: "failed", verdict: "wrong_session", reasonCodes: ["session_mismatch"] });
    }

    if (caller.role !== "student") {
      return fail({ kind: "failed", verdict: "wrong_session", reasonCodes: ["not_enrolled"] });
    }

    const attempts = await countRecentCheckinAttempts(ctx, { studentId: caller._id, now });
    if (attempts >= CHECKIN_RATE_LIMIT_MAX_ATTEMPTS) {
      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: caller.institutionId,
        category: "attendance",
        type: "checkin_rate_limited",
        actorUserId: caller._id,
        subjectUserId: caller._id,
        payload: {
          windowMs: CHECKIN_RATE_LIMIT_WINDOW_MS,
          maxAttempts: CHECKIN_RATE_LIMIT_MAX_ATTEMPTS,
        },
      });
      return { kind: "rate_limited", retryAfterSeconds: 60 };
    }

    // Enrollment gate before any write: a same-institution student who is not
    // enrolled in the session's section gets nothing appended either.
    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_student", (q) => q.eq("studentId", caller._id))
      .filter((q) => q.eq(q.field("sectionId"), session.sectionId))
      .first();
    if (enrollment === null) {
      return fail({ kind: "failed", verdict: "wrong_session", reasonCodes: ["not_enrolled"] });
    }

    if (session.institutionId !== payload.iid) {
      await appendFailure(
        "wrong_session",
        ["session_mismatch"],
        await nonceDigest(payload.n),
        session._id,
      );
      return fail({
        kind: "failed",
        verdict: "wrong_session",
        reasonCodes: ["session_mismatch"],
      });
    }

    const nonceHash = await nonceDigest(payload.n);
    const storedDoc = await ctx.db
      .query("session_challenges")
      .withIndex("by_nonceHash", (q) => q.eq("nonceHash", nonceHash))
      .first();

    // Token verdicts outrank session idempotency: a replayed, expired, or
    // malformed code still reports its own verdict even when the student is
    // already settled in this session.
    const outcome = await classifyRedeem({
      verified,
      stored:
        storedDoc !== null
          ? {
              nonceHash: storedDoc.nonceHash,
              issuedAt: storedDoc.issuedAt,
              expiresAt: storedDoc.expiresAt,
              consumedAt: storedDoc.consumedAt,
            }
          : undefined,
      session: {
        institutionId: session.institutionId,
        sessionId: session._id,
        courseId: session.courseId,
        sectionId: session.sectionId,
        venueId: session.venueId,
        windowEndsAt: session.windowEndsAt,
        status: session.status,
      } satisfies SessionContextState,
      now,
    });

    if (outcome.verdict !== "valid") {
      await appendFailure(outcome.verdict, outcome.reasonCodes, nonceHash, session._id);
      return fail({ kind: "failed", verdict: outcome.verdict, reasonCodes: outcome.reasonCodes });
    }

    if (storedDoc === null) {
      await appendFailure("replayed", ["challenge_unknown"], nonceHash, session._id);
      return fail({ kind: "failed", verdict: "replayed", reasonCodes: ["challenge_unknown"] });
    }

    // (session, student) idempotency: once a decision state is settled for
    // this student in this session, a fresh valid code cannot self-upgrade
    // it. A flagged student re-scanning gets their flagged outcome echoed
    // back, not a second shot at an accept.
    const settled = (
      await latestEventsByStudentSince(ctx, {
        sectionId: session.sectionId,
        sessionId: session._id,
        sinceMs: session.startedAt,
      })
    ).get(caller._id);
    if (settled !== undefined && isDecisionEventState(settled.state)) {
      const course = await ctx.db.get(session.courseId);
      const venue = await ctx.db.get(session.venueId);
      if (settled.state === "step_up") {
        // An unresolved step-up still lets the student finish that challenge;
        // the challenge surface is the authority for its own completion.
        return fail({
          kind: "failed",
          verdict: "wrong_session",
          reasonCodes: ["already_checked_in"],
        });
      }
      const settledState = settled.state as "verified" | "flagged" | "rejected";
      const settledOutcome: Decision["outcome"] =
        settledState === "verified" ? "accept" : settledState === "flagged" ? "flag" : "reject";
      return {
        kind: "ok" as const,
        attendanceEventId: settled._id,
        state: settledState,
        checkedInAt: settled.capturedAt,
        courseCode: course?.code ?? "",
        venueName: venue?.name ?? "",
        outcome: settledOutcome,
        evidence: settled.decision?.evidence ?? { signals: [] },
        reasonCodes: [...(settled.decision?.reasonCodes ?? []), "already_checked_in"],
        policyVersion: settled.decision?.policyVersion ?? "unknown",
        decidedAt: settled.capturedAt,
      };
    }

    await ctx.db.patch(storedDoc._id, { consumedAt: now, consumedByUserId: caller._id });

    const venue = await ctx.db.get(session.venueId);
    const policy = await resolveSessionPolicy(ctx, session);

    const locationOutcome = evaluateLocationConsistency({
      fix: args.location ?? null,
      consent: args.locationConsent ?? "not_requested",
      availability: args.locationAvailability ?? "ok",
      venue:
        venue !== null
          ? {
              latitude: venue.latitude ?? null,
              longitude: venue.longitude ?? null,
              geofenceRadiusMeters: venue.geofenceRadiusMeters ?? null,
            }
          : null,
      policy: {
        defaultRadiusMeters: policy.locationDefaultRadiusMeters,
        inconclusiveMarginMeters: policy.locationInconclusiveMarginMeters,
        maxAccuracyMarginMeters: policy.locationMaxAccuracyMarginMeters,
      },
    });

    const device = await bestDeviceForStudent(ctx, caller._id);
    const recentSecurityFailures = await countRecentChallengeAnomalies(ctx, {
      studentId: caller._id,
      now,
    });
    const decision = decide({
      signals: [
        identitySessionSignal(),
        deviceTrustSignal(device),
        challengePresenceSignal(session._id),
        geolocationSignal(locationOutcome),
      ],
      anomalies: { recentSecurityFailures },
      now,
      policy,
    });

    const attendanceEventId = await appendAttendanceEvent(ctx, {
      institutionId: session.institutionId,
      studentId: caller._id,
      sectionId: session.sectionId,
      sessionId: session._id,
      state: outcomeToAttendanceState(decision.outcome),
      decision,
    });

    const course = await ctx.db.get(session.courseId);

    if (decision.outcome === "step_up") {
      const expiresAt = now + STEPUP_CHALLENGE_TTL_MS;
      const challengeId = await ctx.db.insert("verification_challenges", {
        institutionId: session.institutionId,
        sessionId: session._id,
        studentId: caller._id,
        kind: "checkin_stepup",
        originEventId: attendanceEventId,
        status: "pending",
        attempts: 0,
        createdAt: now,
        expiresAt,
      });
      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: session.institutionId,
        category: "attendance",
        type: "attendance.stepup_requested",
        actorUserId: caller._id,
        subjectUserId: caller._id,
        payload: { challengeId, reasonCodes: decision.reasonCodes, decision },
      });
      return {
        kind: "step_up",
        challenge: { _id: challengeId, expiresAt, maxAttempts: MAX_CHALLENGE_ATTEMPTS },
        courseCode: course?.code ?? "",
        venueName: venue?.name ?? "",
        ...decision,
      };
    }

    return {
      kind: "ok" as const,
      attendanceEventId,
      state: outcomeToAttendanceState(decision.outcome),
      checkedInAt: now,
      courseCode: course?.code ?? "",
      venueName: venue?.name ?? "",
      ...decision,
    };
  },
});
