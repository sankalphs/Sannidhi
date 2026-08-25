import { ConvexError, v } from "convex/values";

import type { Role } from "../src/lib/auth/session";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

export const MAX_SIGNUPS_PER_INSTITUTION_PER_HOUR = 100;
export const SIGNUP_WINDOW_MS = 60 * 60_000;

export const LOGIN_ATTEMPT_WINDOW_MS = 60_000;
export const LOGIN_MAX_ATTEMPTS_PER_WINDOW = 5;

export const getInstitutionByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const institution = await ctx.db
      .query("institutions")
      .withIndex("by_code", (q) => q.eq("code", args.code.trim().toUpperCase()))
      .first();
    if (institution === null) return null;
    return { _id: institution._id, name: institution.name };
  },
});

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    if (user === null) return null;
    const { _id, institutionId, email, name, role, status, usn } = user;
    return { _id, institutionId, email, name, role, status, usn };
  },
});

export const getUserByInstitutionUsn = internalQuery({
  args: { institutionId: v.id("institutions"), usn: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_institution_usn", (q) =>
        q.eq("institutionId", args.institutionId).eq("usn", args.usn.trim().toUpperCase()),
      )
      .first();
    if (user === null) return null;
    const { _id, institutionId, email, name, role, status, usn } = user;
    return { _id, institutionId, email, name, role, status, usn };
  },
});

export const getPasswordCredential = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("password_credentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (credential === null) return null;
    return { hash: credential.hash };
  },
});

/**
 * Atomically consumes one password-login attempt for a subject. Convex
 * serializes mutations, so the limit check and the counter write land in a
 * single transaction: concurrent actions cannot all slip past the cap the way
 * a separate count-then-log pair would allow. Applies to known users and to
 * unknown identifiers alike (keyed by a hash of the submitted identifier), so
 * guessing non-existent accounts also burns throttling capacity.
 */
export const reservePasswordLoginAttempt = internalMutation({
  args: {
    subjectKey: v.string(),
    userId: v.optional(v.id("users")),
    institutionId: v.optional(v.id("institutions")),
  },
  handler: async (ctx, args): Promise<{ remaining: number }> => {
    const now = Date.now();
    const row = await ctx.db
      .query("password_login_attempts")
      .withIndex("by_subjectKey", (q) => q.eq("subjectKey", args.subjectKey))
      .first();

    if (row !== null && now - row.windowStartAt < LOGIN_ATTEMPT_WINDOW_MS) {
      if (row.attempts >= LOGIN_MAX_ATTEMPTS_PER_WINDOW) {
        if (args.institutionId !== undefined) {
          await ctx.runMutation(internal.ledger.appendLedgerEvent, {
            institutionId: args.institutionId,
            category: "identity",
            type: "identity.password_login_rate_limited",
            ...(args.userId !== undefined ? { subjectUserId: args.userId } : {}),
            payload: {
              windowMs: LOGIN_ATTEMPT_WINDOW_MS,
              maxAttempts: LOGIN_MAX_ATTEMPTS_PER_WINDOW,
            },
          });
        }
        throw new ConvexError("rate_limited");
      }
      await ctx.db.patch(row._id, { attempts: row.attempts + 1 });
      return { remaining: LOGIN_MAX_ATTEMPTS_PER_WINDOW - row.attempts - 1 };
    }

    if (row === null) {
      await ctx.db.insert("password_login_attempts", {
        subjectKey: args.subjectKey,
        ...(args.institutionId !== undefined ? { institutionId: args.institutionId } : {}),
        attempts: 1,
        windowStartAt: now,
      });
    } else {
      await ctx.db.patch(row._id, { attempts: 1, windowStartAt: now });
    }
    return { remaining: LOGIN_MAX_ATTEMPTS_PER_WINDOW - 1 };
  },
});

export const recordPasswordLoginFailure = internalMutation({
  args: {
    userId: v.optional(v.id("users")),
    institutionId: v.optional(v.id("institutions")),
    via: v.union(v.literal("email"), v.literal("usn")),
  },
  handler: async (ctx, args) => {
    // The reservation above already enforced the limit; this only keeps the
    // audit trail complete for identifiable subjects.
    if (args.institutionId === undefined) return;
    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: args.institutionId,
      category: "identity",
      type: "identity.password_login_failed",
      ...(args.userId !== undefined ? { subjectUserId: args.userId } : {}),
      payload: { via: args.via },
    });
  },
});

export const clearPasswordLoginAttempts = internalMutation({
  args: { subjectKey: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("password_login_attempts")
      .withIndex("by_subjectKey", (q) => q.eq("subjectKey", args.subjectKey))
      .first();
    if (row !== null) await ctx.db.delete(row._id);
  },
});

export const countInstitutionSignupsSince = internalQuery({
  args: { institutionId: v.id("institutions"), cutoff: v.number() },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .collect();
    return users.filter((user) => user.createdAt >= args.cutoff).length;
  },
});

export const createPasswordUser = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    email: v.string(),
    name: v.string(),
    usn: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.email.trim().toLowerCase();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existingUser !== null) throw new ConvexError("account_exists");

    const normalizedUsn = args.usn.trim().toUpperCase();
    const existingUsn = await ctx.db
      .query("users")
      .withIndex("by_institution_usn", (q) =>
        q.eq("institutionId", args.institutionId).eq("usn", normalizedUsn),
      )
      .first();
    if (existingUsn !== null) {
      throw new ConvexError("usn_taken");
    }

    const recentSignups = (
      await ctx.db
        .query("users")
        .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
        .collect()
    ).filter((user) => user.createdAt >= now - SIGNUP_WINDOW_MS).length;
    if (recentSignups >= MAX_SIGNUPS_PER_INSTITUTION_PER_HOUR) {
      throw new ConvexError("signup_rate_limited");
    }

    const userId = await ctx.db.insert("users", {
      institutionId: args.institutionId,
      email,
      name: args.name.trim(),
      usn: normalizedUsn,
      role: "student",
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("password_credentials", {
      userId,
      hash: args.passwordHash,
      createdAt: now,
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: args.institutionId,
      category: "identity",
      type: "identity.password_signup",
      actorUserId: userId,
      subjectUserId: userId,
      payload: { email, usn: normalizedUsn },
    });

    return { userId };
  },
});

export const completePasswordLogin = internalMutation({
  args: { userId: v.id("users"), via: v.union(v.literal("email"), v.literal("usn")) },
  handler: async (ctx, args): Promise<{ sid: string; expiresAt: number; role: Role }> => {
    const user = await ctx.db.get(args.userId);
    if (user === null) throw new ConvexError("invalid_credentials");
    if (user.status === "suspended") throw new ConvexError("account suspended");

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: user.institutionId,
      category: "identity",
      type: "identity.password_login",
      actorUserId: user._id,
      subjectUserId: user._id,
      payload: { via: args.via },
    });

    const session = await ctx.runMutation(internal.sessions.createSession, {
      userId: user._id,
    });
    return { sid: session.sid, expiresAt: session.expiresAt, role: user.role };
  },
});
