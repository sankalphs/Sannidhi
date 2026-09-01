import { ConvexError, v } from "convex/values";

import type { EvidenceSignal } from "../src/lib/decision";
import {
  FACE_EMBEDDING_VERSION,
  classifyFaceAttempt,
  verdictFromScores,
  type FaceClassification,
} from "../src/lib/biometry";
import {
  challengePresenceSignal,
  decide,
  deviceTrustSignal,
  faceMatchSignal,
  identitySessionSignal,
  type FaceMatchOutcome,
} from "../src/lib/risk";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  appendAttendanceEvent,
  bestDeviceForStudent,
  challengeLifecycle,
  latestEventsByStudentSince,
  parseTtlMs,
  spotRecheckPickIndex,
} from "./lib/attendance_event";
import { requireActorUser } from "./lib/actor";
import { resolveSessionPolicy } from "./lib/policyContext";

/**
 * Step-up + spot-recheck challenge store (Phase 4).
 *
 * Lifecycle:
 * - checkin_stepup: created by checkin.redeemChallenge when decide() returns
 *   step_up; resolved by completeWithFace / escalateToReview.
 * - spot_recheck: created by requestSpotRecheck against an already-verified
 *   student; resolved by completeWithFace or expires into a flagged event.
 *
 * All attendance state changes flow through appendAttendanceEvent; this module
 * never writes attendance rows directly.
 */

const STEPUP_TTL_FALLBACK_MS = 600_000;
const SPOT_RECHECK_TTL_FALLBACK_MS = 300_000;

export const STEPUP_CHALLENGE_TTL_MS = parseTtlMs(
  process.env.SANNIDHI_STEPUP_TTL_MS,
  STEPUP_TTL_FALLBACK_MS,
);
export const SPOT_RECHECK_TTL_MS = parseTtlMs(
  process.env.SANNIDHI_SPOT_TTL_MS,
  SPOT_RECHECK_TTL_FALLBACK_MS,
);
export const MAX_CHALLENGE_ATTEMPTS = 3;
const SWEEP_BATCH_SIZE = 50;

export type ChallengeView = {
  _id: Id<"verification_challenges">;
  kind: "checkin_stepup" | "spot_recheck";
  sessionId: Id<"class_sessions">;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  expiresAt: number;
  courseCode: string;
  venueName: string;
};

type ChallengeKind = Doc<"verification_challenges">["kind"];

const COMPLETION_LEDGER_TYPES: Record<ChallengeKind, string> = {
  checkin_stepup: "attendance.stepup_completed",
  spot_recheck: "attendance.spot_recheck_result",
};

function personOutcome(classification: FaceClassification): FaceMatchOutcome {
  switch (classification.verdict) {
    case "match":
    case "mismatch":
      return { verdict: classification.verdict, similarity: classification.similarity ?? 0 };
    case "spoof_suspected":
      return { verdict: "spoof_suspected" };
    case "inconclusive":
      return { verdict: "inconclusive" };
  }
}

async function sessionSignals(
  ctx: MutationCtx | QueryCtx,
  studentId: Id<"users">,
  sessionId: Id<"class_sessions">,
): Promise<EvidenceSignal[]> {
  return [
    identitySessionSignal(),
    deviceTrustSignal(await bestDeviceForStudent(ctx, studentId)),
    challengePresenceSignal(sessionId),
  ];
}

async function loadActiveTemplate(
  ctx: MutationCtx | QueryCtx,
  studentId: Id<"users">,
): Promise<number[] | null> {
  const records = await ctx.db
    .query("biometric_records")
    .withIndex("by_user", (q) => q.eq("userId", studentId))
    .collect();
  const active = records
    .filter((record) => record.withdrawnAt === undefined)
    .sort((a, b) => b.consentedAt - a.consentedAt)[0];
  if (active === undefined) return null;
  if (active.faceEmbedding === undefined || active.embeddingVersion !== FACE_EMBEDDING_VERSION) {
    return null;
  }
  return active.faceEmbedding;
}
/**
 * Durable expired transition. spot_recheck misses flag the student immediately
 * (the whole point of the re-check); expired step-ups also flag — an abandoned
 * challenge is a dodged verification, and letting it vanish would count the
 * session as neither present nor absent.
 */
async function expirePendingChallenge(
  ctx: MutationCtx,
  challenge: Doc<"verification_challenges">,
  now: number,
): Promise<void> {
  await ctx.db.patch(challenge._id, { status: "expired", resolvedAt: now });

  const session = await ctx.db.get(challenge.sessionId);
  if (session === null) return;
  const decision = decide({
    signals: await sessionSignals(ctx, challenge.studentId, challenge.sessionId),
    anomalies: {
      recentSecurityFailures: 0,
      missedSpotRecheck: challenge.kind === "spot_recheck",
      reviewRequested: challenge.kind === "checkin_stepup",
    },
    now,
    policy: await resolveSessionPolicy(ctx, session),
  });
  await appendAttendanceEvent(ctx, {
    institutionId: session.institutionId,
    studentId: challenge.studentId,
    sectionId: session.sectionId,
    sessionId: session._id,
    state: "flagged",
    decision,
    note:
      challenge.kind === "spot_recheck"
        ? "spot re-check missed"
        : "step-up challenge abandoned (expired)",
  });
  await ctx.runMutation(internal.ledger.appendLedgerEvent, {
    institutionId: session.institutionId,
    category: "attendance",
    type: COMPLETION_LEDGER_TYPES[challenge.kind],
    subjectUserId: challenge.studentId,
    payload: {
      challengeId: challenge._id,
      outcome: challenge.kind === "spot_recheck" ? "missed" : "expired",
      reasonCodes: decision.reasonCodes,
      decision,
    },
  });
}

/**
 * Students eligible for a spot re-check in this session: their latest event is
 * verified and they carry no live pending challenge for it.
 */
async function eligibleSpotRecheckStudents(
  ctx: MutationCtx | QueryCtx,
  session: Doc<"class_sessions">,
  now: number,
): Promise<Array<Id<"users">>> {
  const [latestByStudent, pending] = await Promise.all([
    latestEventsByStudentSince(ctx, {
      sectionId: session.sectionId,
      sessionId: session._id,
      sinceMs: session.startedAt,
    }),
    ctx.db
      .query("verification_challenges")
      .withIndex("by_session_status", (q) => q.eq("sessionId", session._id).eq("status", "pending"))
      .collect(),
  ]);
  const alreadyChallenged = new Set(
    pending
      .filter((challenge) => challenge.expiresAt > now)
      .map((challenge) => challenge.studentId),
  );

  const eligible: Array<Id<"users">> = [];
  for (const [studentId, event] of latestByStudent) {
    if (event.state !== "verified") continue;
    if (alreadyChallenged.has(studentId)) continue;
    eligible.push(studentId);
  }
  // Stable order so the seeded random pick lands on a deterministic student.
  return eligible.sort((a, b) => a.localeCompare(b));
}

export const getMyPending = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<{ challenge: ChallengeView } | null> => {
    const caller = await requireActorUser(ctx, args.actorToken);
    if (caller.role !== "student") throw new ConvexError("unauthorized");
    const now = Date.now();

    // Queries cannot write, so stale pendings are filtered read-only here; the
    // cron sweep and mutation paths perform the durable expired transition.
    const pendings = await ctx.db
      .query("verification_challenges")
      .withIndex("by_student_status", (q) => q.eq("studentId", caller._id).eq("status", "pending"))
      .collect();
    const live = pendings.filter((challenge) => challengeLifecycle(challenge, now) === "active");
    if (live.length === 0) return null;

    const chosen = live.find((challenge) => challenge.kind === "checkin_stepup") ?? live[0];
    if (chosen === undefined) return null;

    const session = await ctx.db.get(chosen.sessionId);
    const course = session !== null ? await ctx.db.get(session.courseId) : null;
    const venue = session !== null ? await ctx.db.get(session.venueId) : null;

    return {
      challenge: {
        _id: chosen._id,
        kind: chosen.kind,
        sessionId: chosen.sessionId,
        attempts: chosen.attempts,
        maxAttempts: MAX_CHALLENGE_ATTEMPTS,
        createdAt: chosen.createdAt,
        expiresAt: chosen.expiresAt,
        courseCode: course?.code ?? "",
        venueName: venue?.name ?? "",
      },
    };
  },
});

export const completeWithFace = mutation({
  args: {
    actorToken: v.string(),
    challengeId: v.id("verification_challenges"),
    embedding: v.array(v.number()),
    liveness: v.object({
      frameCount: v.number(),
      motionScore: v.number(),
      brightnessScore: v.number(),
      // Clients send the full LivenessAssessment; the verdict itself is
      // recomputed server-side from the scores below.
      verdict: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    if (caller.role !== "student") throw new ConvexError("unauthorized");
    const now = Date.now();

    const challenge = await ctx.db.get(args.challengeId);
    if (challenge === null || challenge.studentId !== caller._id) return { kind: "gone" as const };

    const lifecycle = challengeLifecycle(challenge, now);
    if (lifecycle === "resolved") return { kind: "gone" as const };
    if (lifecycle === "expired_pending") {
      await expirePendingChallenge(ctx, challenge, now);
      return { kind: "gone" as const };
    }

    const template = await loadActiveTemplate(ctx, caller._id);
    if (template === null) return { kind: "not_enrolled" as const };

    // Length-mismatched embeddings would throw inside cosineSimilarity; treat
    // them like any other unusable capture instead.
    const classification =
      template.length === args.embedding.length
        ? classifyFaceAttempt({
            template,
            embedding: args.embedding,
            liveness: {
              frameCount: args.liveness.frameCount,
              motionScore: args.liveness.motionScore,
              brightnessScore: args.liveness.brightnessScore,
              verdict: verdictFromScores(
                args.liveness.motionScore,
                args.liveness.brightnessScore,
                args.liveness.frameCount,
              ),
            },
          })
        : { verdict: "inconclusive" as const, similarity: null };

    if (classification.verdict === "inconclusive") {
      const attempts = challenge.attempts + 1;
      const exhausted = attempts >= MAX_CHALLENGE_ATTEMPTS;
      if (exhausted) {
        await ctx.db.patch(challenge._id, { attempts, status: "failed", resolvedAt: now });
        // A fresh decision (never the origin step_up's) so the flagged event
        // carries evidence of the failed attempts' category.
        const session = await ctx.db.get(challenge.sessionId);
        const decision = decide({
          signals: [
            ...(await sessionSignals(ctx, caller._id, challenge.sessionId)),
            faceMatchSignal({ verdict: "inconclusive" }),
          ],
          anomalies: { recentSecurityFailures: 0, reviewRequested: true },
          now,
          policy: session !== null ? await resolveSessionPolicy(ctx, session) : undefined,
        });
        if (session !== null) {
          await appendAttendanceEvent(ctx, {
            institutionId: session.institutionId,
            studentId: caller._id,
            sectionId: session.sectionId,
            sessionId: session._id,
            state: "flagged",
            decision,
            note: "step-up attempts exhausted",
          });
        }
        await ctx.runMutation(internal.ledger.appendLedgerEvent, {
          institutionId: caller.institutionId,
          category: "attendance",
          type: COMPLETION_LEDGER_TYPES[challenge.kind],
          subjectUserId: caller._id,
          payload: {
            challengeId: challenge._id,
            outcome: "exhausted",
            reasonCodes: decision.reasonCodes,
            decision,
          },
        });
      } else {
        await ctx.db.patch(challenge._id, { attempts });
      }
      return {
        kind: "attempt_rejected" as const,
        attemptsLeft: MAX_CHALLENGE_ATTEMPTS - attempts,
        reasonCodes: ["person_check_inconclusive"],
      };
    }

    const personSignal = faceMatchSignal(personOutcome(classification));
    const session = await ctx.db.get(challenge.sessionId);
    if (session === null) return { kind: "gone" as const };
    const decision = decide({
      signals: [...(await sessionSignals(ctx, caller._id, challenge.sessionId)), personSignal],
      anomalies: { recentSecurityFailures: 0 },
      now,
      policy: await resolveSessionPolicy(ctx, session),
    });

    if (classification.verdict === "match") {
      await appendAttendanceEvent(ctx, {
        institutionId: session.institutionId,
        studentId: caller._id,
        sectionId: session.sectionId,
        sessionId: session._id,
        state: "verified",
        decision,
        note: challenge.kind === "checkin_stepup" ? "step-up satisfied" : "spot re-check passed",
      });
      await ctx.db.patch(challenge._id, { status: "passed", resolvedAt: now });
      await ctx.runMutation(internal.ledger.appendLedgerEvent, {
        institutionId: session.institutionId,
        category: "attendance",
        type: COMPLETION_LEDGER_TYPES[challenge.kind],
        actorUserId: caller._id,
        subjectUserId: caller._id,
        payload: {
          challengeId: challenge._id,
          outcome: "passed",
          similarity: classification.similarity ?? 0,
          decision,
        },
      });
      return { kind: "resolved" as const, state: "verified" as const, decision, ...decision };
    }

    await appendAttendanceEvent(ctx, {
      institutionId: session.institutionId,
      studentId: caller._id,
      sectionId: session.sectionId,
      sessionId: session._id,
      state: "flagged",
      decision,
    });
    await ctx.db.patch(challenge._id, { status: "failed", resolvedAt: now });
    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: session.institutionId,
      category: "attendance",
      type: COMPLETION_LEDGER_TYPES[challenge.kind],
      actorUserId: caller._id,
      subjectUserId: caller._id,
      payload: {
        challengeId: challenge._id,
        outcome: "failed",
        reasonCodes: decision.reasonCodes,
        decision,
      },
    });
    return { kind: "resolved" as const, state: "flagged" as const, decision, ...decision };
  },
});

export const escalateToReview = mutation({
  args: {
    actorToken: v.string(),
    challengeId: v.id("verification_challenges"),
    reason: v.literal("camera_unavailable"),
  },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    const now = Date.now();

    const challenge = await ctx.db.get(args.challengeId);
    if (challenge === null || challenge.studentId !== caller._id) return { kind: "gone" as const };
    // Stale pendings are left to the sweep; escalation only settles live ones.
    if (challengeLifecycle(challenge, now) !== "active") return { kind: "gone" as const };

    const session = await ctx.db.get(challenge.sessionId);
    if (session === null) return { kind: "gone" as const };

    await ctx.db.patch(challenge._id, { status: "escalated", resolvedAt: now });

    const decision = decide({
      signals: await sessionSignals(ctx, caller._id, challenge.sessionId),
      anomalies: { recentSecurityFailures: 0, reviewRequested: true },
      now,
      policy: await resolveSessionPolicy(ctx, session),
    });

    await appendAttendanceEvent(ctx, {
      institutionId: session.institutionId,
      studentId: caller._id,
      sectionId: session.sectionId,
      sessionId: session._id,
      state: "flagged",
      decision,
      note: "escalated to faculty review: camera unavailable",
    });
    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: session.institutionId,
      category: "attendance",
      type: "attendance.stepup_escalated",
      actorUserId: caller._id,
      subjectUserId: caller._id,
      payload: { challengeId: challenge._id, reason: args.reason },
    });

    return { kind: "resolved" as const, state: "flagged" as const, decision, ...decision };
  },
});

export const requestSpotRecheck = mutation({
  args: {
    actorToken: v.string(),
    sessionId: v.id("class_sessions"),
    studentId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    const fail = (
      reason:
        "unauthorized" | "session_not_active" | "no_eligible_students" | "student_not_eligible",
    ) => ({ kind: "error" as const, reason });

    if (caller.role !== "faculty") return fail("unauthorized");
    const session = await ctx.db.get(args.sessionId);
    if (session === null || session.facultyId !== caller._id) return fail("unauthorized");

    const now = Date.now();
    if (session.status !== "active" || now >= session.windowEndsAt) {
      return fail("session_not_active");
    }

    const eligible = await eligibleSpotRecheckStudents(ctx, session, now);

    let targetId: Id<"users">;
    let selector: "targeted" | "random";
    if (args.studentId !== undefined) {
      if (!eligible.some((studentId) => studentId === args.studentId)) {
        return fail("student_not_eligible");
      }
      targetId = args.studentId;
      selector = "targeted";
    } else {
      if (eligible.length === 0) return fail("no_eligible_students");
      /**
       * Faculty-triggered randomness lives in the timing of the tap; mutations
       * must stay deterministic for Convex argument replay.
       */
      const picked = eligible[spotRecheckPickIndex(eligible.length, now)];
      if (picked === undefined) return fail("no_eligible_students");
      targetId = picked;
      selector = "random";
    }

    const challengeId = await ctx.db.insert("verification_challenges", {
      institutionId: session.institutionId,
      sessionId: session._id,
      studentId: targetId,
      kind: "spot_recheck",
      requestedByUserId: caller._id,
      status: "pending",
      attempts: 0,
      createdAt: now,
      expiresAt: now + SPOT_RECHECK_TTL_MS,
    });
    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: session.institutionId,
      category: "attendance",
      type: "attendance.spot_recheck_requested",
      actorUserId: caller._id,
      subjectUserId: targetId,
      payload: { challengeId, selector, sessionId: session._id, studentId: targetId },
    });

    return {
      kind: "requested" as const,
      challenge: { _id: challengeId, studentId: targetId, expiresAt: now + SPOT_RECHECK_TTL_MS },
    };
  },
});

export const expireStaleChallenges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const batch = await ctx.db
      .query("verification_challenges")
      .withIndex("by_status_expires", (q) => q.eq("status", "pending").lt("expiresAt", now))
      .take(SWEEP_BATCH_SIZE);

    for (const challenge of batch) {
      await expirePendingChallenge(ctx, challenge, now);
    }
    return { expired: batch.length };
  },
});
