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
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { MAX_CHALLENGE_ATTEMPTS, STEPUP_CHALLENGE_TTL_MS } from "./challenges";
import {
  appendAttendanceEvent,
  bestDeviceForStudent,
  CHECKIN_RATE_LIMIT_MAX_ATTEMPTS,
  CHECKIN_RATE_LIMIT_WINDOW_MS,
  countRecentChallengeAnomalies,
  countRecentCheckinAttempts,
  RATE_LIMIT_EVENT_TYPES,
} from "./lib/attendance_event";
import { resolveActorUser } from "./lib/actor";
import { resolveSessionPolicy } from "./lib/policyContext";

type FailureVerdict = Exclude<RedeemVerdict, "valid">;

type SecurityEventType = (typeof RATE_LIMIT_EVENT_TYPES)[number];

const FAILURE_EVENT_TYPES: Record<FailureVerdict, SecurityEventType> = {
  expired: "challenge_expired_use",
  malformed: "malformed_challenge",
  replayed: "challenge_replayed",
  wrong_session: "wrong_session_challenge",
};

async function requireActorUser(
  ctx: MutationCtx | QueryCtx,
  actorToken: string,
): Promise<Doc<"users">> {
  const user = await resolveActorUser(ctx, actorToken).catch(() => null);
  if (user === null) throw new ConvexError("unauthorized");
  return user;
}

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
      state: ReturnType<typeof outcomeToAttendanceState>;
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

    if (session === null || session.institutionId !== payload.iid) {
      await appendFailure(
        "wrong_session",
        ["session_mismatch"],
        await nonceDigest(payload.n),
        session?._id,
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

    if (caller.role !== "student") {
      await appendFailure("wrong_session", ["not_enrolled"], nonceHash, session._id);
      return fail({ kind: "failed", verdict: "wrong_session", reasonCodes: ["not_enrolled"] });
    }

    const enrollment = await ctx.db
      .query("enrollments")
      .withIndex("by_student", (q) => q.eq("studentId", caller._id))
      .filter((q) => q.eq(q.field("sectionId"), session.sectionId))
      .first();
    if (enrollment === null) {
      await appendFailure("wrong_session", ["not_enrolled"], nonceHash, session._id);
      return fail({ kind: "failed", verdict: "wrong_session", reasonCodes: ["not_enrolled"] });
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
