import { ConvexError, v } from "convex/values";

import { computeEventHash } from "../src/lib/ledger/hash";
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
import { resolveActorUser } from "./lib/actor";

const SESSION_POLICY_VERSION = "phase2-session-v1";

type FailureVerdict = Exclude<RedeemVerdict, "valid">;

const FAILURE_EVENT_TYPES: Record<FailureVerdict, string> = {
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

export const redeemChallenge = mutation({
  args: { actorToken: v.string(), token: v.string() },
  handler: async (ctx, args) => {
    const caller = await requireActorUser(ctx, args.actorToken);
    const now = Date.now();

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
    };

    const verified = await verifyChallengeToken(args.token);
    if (!verified.ok) {
      const reasonCodes = [verified.reasonCode];
      await appendFailure("malformed", reasonCodes);
      throw new ConvexError({ code: "checkin_failed", verdict: "malformed", reasonCodes });
    }

    const payload = verified.payload;
    let session: Doc<"class_sessions"> | null = null;
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
      throw new ConvexError({
        code: "checkin_failed",
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
      throw new ConvexError({
        code: "checkin_failed",
        verdict: outcome.verdict,
        reasonCodes: outcome.reasonCodes,
      });
    }

    if (storedDoc === null) {
      await appendFailure("replayed", ["challenge_unknown"], nonceHash, session._id);
      throw new ConvexError({
        code: "checkin_failed",
        verdict: "replayed",
        reasonCodes: ["challenge_unknown"],
      });
    }

    await ctx.db.patch(storedDoc._id, { consumedAt: now, consumedByUserId: caller._id });

    const lastEvent = await ctx.db
      .query("attendance_events")
      .withIndex("by_seq")
      .order("desc")
      .first();
    const seq = lastEvent !== null ? lastEvent.seq + 1 : 0;
    const prevEventHash = lastEvent?.eventHash;

    const eventHash = await computeEventHash({
      institutionId: session.institutionId,
      category: "attendance",
      type: "attendance.session_checkin",
      subjectUserId: caller._id,
      payload: {
        studentId: caller._id,
        sessionId: session._id,
        sectionId: session.sectionId,
        state: "session_verified",
        origin: "online",
        policyVersion: SESSION_POLICY_VERSION,
      },
      seq,
      prevEventHash,
    });

    const attendanceEventId = await ctx.db.insert("attendance_events", {
      institutionId: session.institutionId,
      studentId: caller._id,
      sectionId: session.sectionId,
      state: "session_verified",
      origin: "online",
      policyVersion: SESSION_POLICY_VERSION,
      seq,
      prevEventHash,
      eventHash,
      decision: {
        outcome: "accept",
        evidence: {
          signals: [
            { category: "identity", source: "passkey_session", status: "verified" },
            { category: "device", source: "registered_device", status: "trusted" },
            { category: "presence", source: "qr_challenge", status: "verified" },
          ],
        },
        reasonCodes: [],
        policyVersion: SESSION_POLICY_VERSION,
        decidedAt: now,
      },
      capturedAt: now,
    });

    const [course, venue] = await Promise.all([
      ctx.db.get(session.courseId),
      ctx.db.get(session.venueId),
    ]);

    return {
      verdict: "valid" as const,
      attendanceEventId,
      state: "session_verified" as const,
      checkedInAt: now,
      courseCode: course?.code ?? "",
      venueName: venue?.name ?? "",
    };
  },
});
