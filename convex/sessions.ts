import { v } from "convex/values";

import { SESSION_TTL_MS, hashSessionSid, randomSid } from "../src/lib/auth/token-hash";
import {
  internalMutation,
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
  return row.revokedAt === undefined && row.expiresAt > now;
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
  const expiresAt = now + slidingTtlMs;
  await ctx.db.patch(row._id, { lastSeenAt: now, expiresAt });
  return expiresAt;
}

export const touch = internalMutation({
  args: { tokenHash: v.string(), slidingTtlMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const expiresAt = await touchByTokenHash(
      ctx,
      args.tokenHash,
      args.slidingTtlMs ?? SESSION_TTL_MS,
    );
    if (expiresAt === null) throw new Error("session not active");
    return { expiresAt };
  },
});

export const touchBySid = internalMutation({
  args: { sid: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await hashSessionSid(args.sid);
    await touchByTokenHash(ctx, tokenHash, SESSION_TTL_MS);
    return { ok: true as const };
  },
});

export const revokeBySid = internalMutation({
  args: { sid: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await hashSessionSid(args.sid);
    const row = await getActiveRow(ctx, tokenHash);
    if (row === null) return { revoked: false };
    await ctx.db.patch(row._id, { revokedAt: Date.now() });
    return { revoked: true };
  },
});

export const revokeAllForCredential = internalMutation({
  args: { userId: v.id("users"), credentialId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    let count = 0;
    for (const session of sessions) {
      if (session.credentialId !== args.credentialId || !isActiveSession(session, now)) continue;
      await ctx.db.patch(session._id, { revokedAt: now });
      count += 1;
    }
    return count;
  },
});

export const revokeAllForUser = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    let count = 0;
    for (const session of sessions) {
      if (!isActiveSession(session, now)) continue;
      await ctx.db.patch(session._id, { revokedAt: now });
      count += 1;
    }
    return count;
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

export const getSessionFreshAuth = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const claims = await verifyActorToken(args.actorToken);
    if (claims.sid === undefined) return { lastSeenAt: null };
    const tokenHash = await hashSessionSid(claims.sid);
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (row === null || !isActiveSession(row, Date.now())) return { lastSeenAt: null };
    return { lastSeenAt: row.lastSeenAt ?? null };
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
