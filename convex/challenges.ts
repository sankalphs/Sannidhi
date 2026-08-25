import { ConvexError, v } from "convex/values";

import type { Decision } from "../src/lib/decision";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { resolveActorUser } from "./lib/actor";

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

export const STEPUP_CHALLENGE_TTL_MS = Number(process.env.SANNIDHI_STEPUP_TTL_MS ?? 600_000);
export const SPOT_RECHECK_TTL_MS = Number(process.env.SANNIDHI_SPOT_TTL_MS ?? 300_000);
export const MAX_CHALLENGE_ATTEMPTS = 3;

export const FACE_EMBEDDING_VERSION = "faceembed/v1";

export async function requireActorUser(
  ctx: MutationCtx | QueryCtx,
  actorToken: string,
): Promise<Doc<"users">> {
  const user = await resolveActorUser(ctx, actorToken).catch(() => null);
  if (user === null) throw new ConvexError("unauthorized");
  return user;
}

const challengeView = v.object({
  _id: v.id("verification_challenges"),
  kind: v.union(v.literal("checkin_stepup"), v.literal("spot_recheck")),
  sessionId: v.id("class_sessions"),
  attempts: v.number(),
  maxAttempts: v.number(),
  createdAt: v.number(),
  expiresAt: v.number(),
  courseCode: v.string(),
  venueName: v.string(),
});

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

export const getMyPending = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<{ challenge: ChallengeView } | null> => {
    void ctx;
    void args;
    throw new ConvexError("not_implemented");
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
    }),
  },
  handler: async (ctx, args) => {
    void ctx;
    void args;
    throw new ConvexError("not_implemented");
  },
});

export const escalateToReview = mutation({
  args: {
    actorToken: v.string(),
    challengeId: v.id("verification_challenges"),
    reason: v.literal("camera_unavailable"),
  },
  handler: async (ctx, args) => {
    void ctx;
    void args;
    throw new ConvexError("not_implemented");
  },
});

export const requestSpotRecheck = mutation({
  args: {
    actorToken: v.string(),
    sessionId: v.id("class_sessions"),
    studentId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    void ctx;
    void args;
    throw new ConvexError("not_implemented");
  },
});

export const expireStaleChallenges = internalMutation({
  args: {},
  handler: async (ctx) => {
    void ctx;
    throw new ConvexError("not_implemented");
  },
});
