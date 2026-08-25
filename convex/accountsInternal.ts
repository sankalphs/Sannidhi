import { ConvexError, v } from "convex/values";

import type { Role } from "../src/lib/auth/session";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

export const MAX_SIGNUPS_PER_INSTITUTION_PER_HOUR = 100;
export const SIGNUP_WINDOW_MS = 60 * 60_000;

export const LOGIN_FAILURE_WINDOW_MS = 60_000;
export const LOGIN_FAILURE_MAX_ATTEMPTS = 5;

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

export const countRecentPasswordLoginFailures = internalQuery({
  args: { userId: v.id("users"), sinceMs: v.number(), now: v.number() },
  handler: async (ctx, args) => {
    const cutoff = args.now - args.sinceMs;
    const rows = await ctx.db
      .query("event_ledger")
      .withIndex("by_subject_category_type_created", (q) =>
        q
          .eq("subjectUserId", args.userId)
          .eq("category", "identity")
          .eq("type", "identity.password_login_failed")
          .gte("createdAt", cutoff),
      )
      .collect();
    return rows.length;
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
