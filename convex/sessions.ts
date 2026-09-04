import { v } from "convex/values";

import {
  SESSION_ABSOLUTE_MAX_MS,
  SESSION_TTL_MS,
  hashSessionSid,
  randomSid,
} from "../src/lib/auth/token-hash";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { verifyActorToken } from "./lib/actor";

type SessionDoc = {
  _id: Id<"sessions">;
  userId: Id<"users">;
  tokenHash: string;
  credentialId?: string;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  lastSeenAt?: number;
};

function isActiveSession(row: SessionDoc, now: number): boolean {
  if (row.revokedAt !== undefined || row.expiresAt <= now) return false;
  if (row.createdAt + SESSION_ABSOLUTE_MAX_MS <= now) return false;
  return true;
}

async function getActiveRow(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string,
): Promise<SessionDoc | null> {
  const row = await ctx.db
    .query("sessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  return row !== null && isActiveSession(row, Date.now()) ? row : null;
}

async function insertSession(
  ctx: MutationCtx,
  args: { userId: Id<"users">; credentialId?: string },
): Promise<{ sid: string; expiresAt: number }> {
  const now = Date.now();
  const sid = randomSid();
  const tokenHash = await hashSessionSid(sid);
  const expiresAt = now + SESSION_TTL_MS;
  await ctx.db.insert("sessions", {
    userId: args.userId,
    tokenHash,
    ...(args.credentialId !== undefined ? { credentialId: args.credentialId } : {}),
    createdAt: now,
    expiresAt,
  });
  return { sid, expiresAt };
}

export const createSession = internalMutation({
  args: { userId: v.id("users"), credentialId: v.optional(v.string()) },
  handler: async (ctx, args) => insertSession(ctx, args),
});

async function touchByTokenHash(
  ctx: MutationCtx,
  tokenHash: string,
  slidingTtlMs: number,
): Promise<number | null> {
  const row = await getActiveRow(ctx, tokenHash);
  if (row === null) return null;
  const now = Date.now();
  const absoluteDeadline = row.createdAt + SESSION_ABSOLUTE_MAX_MS;
  if (absoluteDeadline <= now) return null;
  const expiresAt = Math.min(now + slidingTtlMs, absoluteDeadline);
  await ctx.db.patch(row._id, { lastSeenAt: now, expiresAt });
  return expiresAt;
}

export const markStepUp = internalMutation({
  args: { sid: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await hashSessionSid(args.sid);
    const row = await getActiveRow(ctx, tokenHash);
    if (row === null) return { recorded: false as const };
    const now = Date.now();
    await ctx.db.patch(row._id, { lastStepUpAt: now, lastSeenAt: now });
    return { recorded: true as const, lastStepUpAt: now };
  },
});

export const getSessionStepUpStatus = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await verifyActorToken(args.actorToken);
    if (claims.sid === undefined) return { lastStepUpAt: null };
    const tokenHash = await hashSessionSid(claims.sid);
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (row === null || !isActiveSession(row, Date.now())) return { lastStepUpAt: null };
    return { lastStepUpAt: row.lastStepUpAt ?? null };
  },
});

export const getSessionStatus = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await verifyActorToken(args.actorToken);
    if (claims.sid === undefined) {
      return { active: true, expiresAt: null };
    }
    const tokenHash = await hashSessionSid(claims.sid);
    const row = await getActiveRow(ctx, tokenHash);
    return row !== null
      ? { active: true, expiresAt: row.expiresAt }
      : { active: false, expiresAt: null };
  },
});

/**
 * Server-side fresh-auth check for boundary enforcement: given a raw sid
 * (known only to the session holder), confirm the session is active and its
 * last step-up is within maxAgeMs. Throws on failure so Convex mutations
 * that gate on it cannot be satisfied by caller-supplied booleans.
 */
export const getSessionFreshAuthBySid = internalQuery({
  args: { sid: v.string(), maxAgeMs: v.number() },
  handler: async (ctx, args) => {
    const tokenHash = await hashSessionSid(args.sid);
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    const now = Date.now();
    const fresh =
      row !== null &&
      isActiveSession(row, now) &&
      row.lastStepUpAt !== undefined &&
      now - row.lastStepUpAt <= args.maxAgeMs;
    if (!fresh) throw new Error("identity re-verification required");
    return { fresh: true as const };
  },
});

export const renewMySession = mutation({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await verifyActorToken(args.actorToken);
    if (claims.sid === undefined) return { renewed: false as const };
    const tokenHash = await hashSessionSid(claims.sid);
    const expiresAt = await touchByTokenHash(ctx, tokenHash, SESSION_TTL_MS);
    if (expiresAt === null) return { renewed: false as const };
    return { renewed: true as const, expiresAt };
  },
});

export const revokeMySession = mutation({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await verifyActorToken(args.actorToken);
    if (claims.sid === undefined) return { revoked: false as const };
    const tokenHash = await hashSessionSid(claims.sid);
    const row = await getActiveRow(ctx, tokenHash);
    if (row === null) return { revoked: false as const };
    await ctx.db.patch(row._id, { revokedAt: Date.now() });
    return { revoked: true as const };
  },
});
