import { jwtVerify } from "jose";
import { ConvexError } from "convex/values";

import {
  ACTOR_TOKEN_ALGORITHM,
  ACTOR_TOKEN_MAX_AGE_SECONDS,
  getActorSecret,
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

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== "number") {
    throw new Error("Invalid actor token: missing issued-at claim");
  }
  if (now - payload.iat > ACTOR_TOKEN_MAX_AGE_SECONDS) {
    throw new Error(`Invalid actor token: issued more than ${ACTOR_TOKEN_MAX_AGE_SECONDS}s ago`);
  }

  const { userId, role, sid } = payload;
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

/**
 * Resolve the actor and, when the token carries a server-side session id,
 * reject tokens whose session has been revoked or expired. Tokens without a
 * sid (demo/dev logins) have no server-side session record to check.
 */
export async function requireActorUserWithActiveSession(
  ctx: MutationCtx | QueryCtx,
  token: string,
): Promise<Doc<"users">> {
  const claims = await verifyActorToken(token);
  if (claims.sid !== undefined) {
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
  let user: Doc<"users"> | null = null;
  try {
    user = await ctx.db.get(claims.userId as Id<"users">);
  } catch {
    user = null;
  }
  if (user === null || user.status === "suspended") throw new ConvexError("unauthorized");
  return user;
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
  if (claims.role !== "admin") throw new ConvexError("unauthorized");
  let user: Doc<"users"> | null;
  try {
    user = await ctx.db.get(claims.userId as Id<"users">);
  } catch {
    throw new ConvexError("unauthorized");
  }
  if (user === null || user.status === "suspended") throw new ConvexError("unauthorized");
  return user;
}

export function assertSameInstitution(
  adminInstitutionId: Id<"institutions">,
  targetInstitutionId: Id<"institutions">,
): void {
  if (adminInstitutionId !== targetInstitutionId) throw new ConvexError("unauthorized");
}
