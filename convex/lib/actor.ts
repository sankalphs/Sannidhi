import { jwtVerify } from "jose";
import { ConvexError } from "convex/values";

import {
  ACTOR_TOKEN_ALGORITHM,
  ACTOR_TOKEN_MAX_AGE_SECONDS,
  getActorSecret,
  SESSION_ACTOR_TOKEN_MAX_AGE_SECONDS,
  type ActorTokenClaims,
} from "../../src/lib/auth/actor-token";
import { SESSION_ABSOLUTE_MAX_MS } from "../../src/lib/auth/token-hash";
import { hashSessionSid } from "../../src/lib/auth/token-hash";
import { ROLES, type Role } from "../../src/lib/auth/session";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function verifyActorToken(token: string): Promise<ActorTokenClaims> {
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(token, getActorSecret(), {
      algorithms: [ACTOR_TOKEN_ALGORITHM],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "verification failed";
    throw new Error(`Invalid actor token: ${reason}`);
  }

  const { userId, role, sid } = payload;
  // Sid-carrying tokens are bounded by the server session itself (checked in
  // requireActorUser*); sid-less ones only by this issued-at window.
  const maxAge =
    typeof sid === "string" && sid.length > 0
      ? SESSION_ACTOR_TOKEN_MAX_AGE_SECONDS
      : ACTOR_TOKEN_MAX_AGE_SECONDS;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== "number") {
    throw new Error("Invalid actor token: missing issued-at claim");
  }
  if (now - payload.iat > maxAge) {
    throw new Error(`Invalid actor token: issued more than ${maxAge}s ago`);
  }

  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Invalid actor token: missing userId claim");
  }
  if (typeof role !== "string" || !ROLES.includes(role as Role)) {
    throw new Error("Invalid actor token: missing or unknown role claim");
  }

  const claims: ActorTokenClaims = { userId, role: role as Role };
  if (typeof sid === "string" && sid.length > 0) {
    claims.sid = sid;
  }
  return claims;
}

/**
 * Resolves the token to a user without any status checks. Demo/dev surfaces
 * that render "is this user real" information use this; anything that mutates
 * must use requireActorUser below so suspension and role changes take effect
 * immediately.
 */
export async function resolveActorUser(
  ctx: MutationCtx | QueryCtx,
  token: string,
): Promise<Doc<"users"> | null> {
  const claims = await verifyActorToken(token);
  try {
    return await ctx.db.get(claims.userId as Id<"users">);
  } catch {
    return null;
  }
}

/** Rejects tokens whose server-side session was revoked or expired; sid-less tokens (demo/dev logins) have nothing to check. */
async function assertSessionActiveIfPresent(
  ctx: MutationCtx | QueryCtx,
  claims: ActorTokenClaims,
): Promise<void> {
  if (claims.sid === undefined) return;
  const tokenHash = await hashSessionSid(claims.sid);
  let row: Doc<"sessions"> | null = null;
  try {
    row = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
  } catch {
    row = null;
  }
  const now = Date.now();
  const sessionActive =
    row !== null &&
    row.revokedAt === undefined &&
    row.expiresAt > now &&
    row.createdAt + SESSION_ABSOLUTE_MAX_MS > now;
  if (!sessionActive) throw new ConvexError("unauthorized");
}

/**
 * The one actor guard for every mutating entry point: verifies the token,
 * rejects suspended users, and — when the token carries a server session id —
 * rejects revoked/expired sessions. Callers gate roles off the returned user
 * doc, so the stored role is always what gets enforced.
 */
export async function requireActorUserWithActiveSession(
  ctx: MutationCtx | QueryCtx,
  token: string,
): Promise<Doc<"users">> {
  const claims = await verifyActorToken(token);
  await assertSessionActiveIfPresent(ctx, claims);
  let user: Doc<"users"> | null = null;
  try {
    user = await ctx.db.get(claims.userId as Id<"users">);
  } catch {
    user = null;
  }
  if (user === null || user.status === "suspended") throw new ConvexError("unauthorized");
  return user;
}

/** Alias so new call sites read naturally next to resolveActorUser. */
export const requireActorUser = requireActorUserWithActiveSession;

/**
 * Enforces the fresh-auth (recent step-up) window server-side, inside the
 * Convex boundary, so caller-supplied booleans can never satisfy it. Tokens
 * without a sid (demo/dev logins) have no step-up record; they fail closed
 * unless allowWithoutSession is set for seed/dev-only paths.
 */
export async function requireFreshAuth(
  ctx: MutationCtx | QueryCtx,
  token: string,
  windowMs: number,
  options?: { allowWithoutSession?: boolean },
): Promise<void> {
  const claims = await verifyActorToken(token);
  if (claims.sid === undefined) {
    if (options?.allowWithoutSession === true) return;
    throw new ConvexError("identity re-verification required");
  }
  const tokenHash = await hashSessionSid(claims.sid);
  let row: Doc<"sessions"> | null = null;
  try {
    row = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
  } catch {
    row = null;
  }
  const now = Date.now();
  const stepUpFresh =
    row !== null &&
    row.revokedAt === undefined &&
    row.expiresAt > now &&
    row.lastStepUpAt !== undefined &&
    now - row.lastStepUpAt <= windowMs;
  if (!stepUpFresh) throw new ConvexError("identity re-verification required");
}

export async function requireAdminUser(
  ctx: MutationCtx | QueryCtx,
  token: string,
): Promise<Doc<"users">> {
  let claims: ActorTokenClaims;
  try {
    claims = await verifyActorToken(token);
  } catch (error) {
    throw new ConvexError(error instanceof Error ? error.message : "unauthorized");
  }
  await assertSessionActiveIfPresent(ctx, claims);
  let user: Doc<"users"> | null;
  try {
    user = await ctx.db.get(claims.userId as Id<"users">);
  } catch {
    throw new ConvexError("unauthorized");
  }
  if (user === null || user.status === "suspended") throw new ConvexError("unauthorized");
  // Stored role is authoritative: a demoted admin must not keep admin power
  // through a still-valid token minted for their old role.
  if (user.role !== "admin") throw new ConvexError("unauthorized");
  return user;
}

/** Analytics and flagged-review surfaces serve admins and department authority. */
export async function requireAnalyticsAuthority(
  ctx: MutationCtx | QueryCtx,
  token: string,
): Promise<Doc<"users">> {
  let claims: ActorTokenClaims;
  try {
    claims = await verifyActorToken(token);
  } catch (error) {
    throw new ConvexError(error instanceof Error ? error.message : "unauthorized");
  }
  if (claims.role !== "admin" && claims.role !== "department_authority") {
    throw new ConvexError("unauthorized");
  }
  // Revoked or expired server sessions invalidate the token immediately.
  await assertSessionActiveIfPresent(ctx, claims);
  let user: Doc<"users"> | null;
  try {
    user = await ctx.db.get(claims.userId as Id<"users">);
  } catch {
    throw new ConvexError("unauthorized");
  }
  if (user === null || user.status === "suspended") throw new ConvexError("unauthorized");
  // The stored role is authoritative: a demoted user must not retain
  // analytics access through a still-valid token minted for their old role.
  if (user.role !== "admin" && user.role !== "department_authority") {
    throw new ConvexError("unauthorized");
  }
  return user;
}

export function assertSameInstitution(
  adminInstitutionId: Id<"institutions">,
  targetInstitutionId: Id<"institutions">,
): void {
  if (adminInstitutionId !== targetInstitutionId) throw new ConvexError("unauthorized");
}
