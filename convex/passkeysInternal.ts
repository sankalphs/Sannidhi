import { ConvexError, v } from "convex/values";

import { CHALLENGE_TTL_MS, isChallengeUsable } from "../src/lib/auth/challenge";
import type { Role } from "../src/lib/auth/session";
import { activateUserAndAcceptInvite, findPendingInviteForUser } from "./invites";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { requireAdminUser } from "./lib/actor";

type CeremonyResult = { sid: string; expiresAt: number; role: Role };

export const getUserCore = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user === null) return null;
    const { _id, institutionId, email, name, role, status } = user;
    return { _id, institutionId, email, name, role, status };
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
    const { _id, institutionId, email, name, role, status } = user;
    return { _id, institutionId, email, name, role, status };
  },
});

export const listActiveCredentials = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("passkey_credentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return credentials
      .filter((credential) => credential.revokedAt === undefined)
      .map((credential) => ({
        credentialId: credential.credentialId,
        ...(credential.transports !== undefined ? { transports: credential.transports } : {}),
      }));
  },
});

export const getCredentialForAuth = internalQuery({
  args: { credentialId: v.string() },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("passkey_credentials")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    if (credential === null) return null;
    return {
      _id: credential._id,
      userId: credential.userId,
      credentialId: credential.credentialId,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
      revokedAt: credential.revokedAt,
    };
  },
});

export const getChallengeRow = internalQuery({
  args: { challenge: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("auth_challenges")
      .withIndex("by_challenge", (q) => q.eq("challenge", args.challenge))
      .unique(),
});

export const storeChallenge = internalMutation({
  args: {
    challenge: v.string(),
    purpose: v.union(v.literal("registration"), v.literal("authentication")),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auth_challenges", {
      challenge: args.challenge,
      purpose: args.purpose,
      ...(args.userId !== undefined ? { userId: args.userId } : {}),
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    });
    return { ok: true as const };
  },
});

export const consumeChallenge = internalMutation({
  args: { challenge: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("auth_challenges")
      .withIndex("by_challenge", (q) => q.eq("challenge", args.challenge))
      .unique();
    if (
      row === null ||
      !isChallengeUsable(row, "authentication", now) ||
      (args.userId !== undefined && row.userId !== args.userId)
    ) {
      return { consumed: false as const };
    }
    await ctx.db.patch(row._id, { consumedAt: now });
    return { consumed: true as const };
  },
});

export const updateCredentialCounter = internalMutation({
  args: {
    credentialRecordId: v.id("passkey_credentials"),
    newCounter: v.number(),
    lastUsedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.credentialRecordId, {
      counter: args.newCounter,
      lastUsedAt: args.lastUsedAt,
    });
  },
});

export const completeRegistration = internalMutation({
  args: {
    challenge: v.string(),
    userId: v.id("users"),
    credentialId: v.string(),
    publicKey: v.string(),
    counter: v.number(),
    transports: v.array(v.string()),
    aaguid: v.string(),
  },
  handler: async (ctx, args): Promise<CeremonyResult> => {
    const now = Date.now();
    const challengeRow = await ctx.db
      .query("auth_challenges")
      .withIndex("by_challenge", (q) => q.eq("challenge", args.challenge))
      .unique();
    if (
      challengeRow === null ||
      !isChallengeUsable(challengeRow, "registration", now) ||
      challengeRow.userId !== args.userId
    ) {
      throw new Error("challenge invalid or expired");
    }

    const existing = await ctx.db
      .query("passkey_credentials")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    if (existing !== null && existing.revokedAt === undefined) {
      throw new Error("credential already registered");
    }

    await ctx.db.patch(challengeRow._id, { consumedAt: now });

    await ctx.db.insert("passkey_credentials", {
      userId: args.userId,
      credentialId: args.credentialId,
      publicKey: args.publicKey,
      counter: args.counter,
      transports: args.transports,
      createdAt: now,
    });

    const user = await ctx.db.get(args.userId);
    if (user === null) throw new Error("user not found");
    if (user.status === "suspended") throw new Error("account suspended");

    if (user.status === "invited") {
      const invite = await findPendingInviteForUser(ctx, user);
      if (invite === null) {
        throw new Error("no pending invite found for this account");
      }
      await activateUserAndAcceptInvite(ctx, { user, invite });
    }

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: user.institutionId,
      category: "identity",
      type: "identity.passkey_registered",
      actorUserId: user._id,
      subjectUserId: user._id,
      payload: { credentialId: args.credentialId, aaguid: args.aaguid },
    });

    const session = await ctx.runMutation(internal.sessions.createSession, {
      userId: user._id,
      credentialId: args.credentialId,
    });
    return { sid: session.sid, expiresAt: session.expiresAt, role: user.role };
  },
});

export const completeAuthentication = internalMutation({
  args: {
    challenge: v.string(),
    credentialRecordId: v.id("passkey_credentials"),
    newCounter: v.number(),
  },
  handler: async (ctx, args): Promise<CeremonyResult> => {
    const now = Date.now();
    const challengeRow = await ctx.db
      .query("auth_challenges")
      .withIndex("by_challenge", (q) => q.eq("challenge", args.challenge))
      .unique();
    if (challengeRow === null || !isChallengeUsable(challengeRow, "authentication", now)) {
      throw new Error("challenge invalid or expired");
    }

    const credential = await ctx.db.get(args.credentialRecordId);
    if (credential === null || credential.revokedAt !== undefined) {
      throw new Error("credential unavailable");
    }
    if (challengeRow.userId !== undefined && challengeRow.userId !== credential.userId) {
      throw new Error("challenge bound to a different account");
    }

    const counterAdvanced =
      (args.newCounter === 0 && credential.counter === 0) || args.newCounter > credential.counter;
    if (!counterAdvanced) {
      throw new Error("credential counter did not advance; possible cloned authenticator");
    }

    await ctx.db.patch(challengeRow._id, { consumedAt: now });
    await ctx.db.patch(credential._id, { counter: args.newCounter, lastUsedAt: now });

    const user: Doc<"users"> | null = await ctx.db.get(credential.userId);
    if (user === null) throw new Error("user not found");
    if (user.status === "suspended") throw new Error("account suspended");

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: user.institutionId,
      category: "identity",
      type: "identity.passkey_login",
      actorUserId: user._id,
      subjectUserId: user._id,
      payload: { credentialId: credential.credentialId },
    });

    const session = await ctx.runMutation(internal.sessions.createSession, {
      userId: user._id,
      credentialId: credential.credentialId,
    });
    return { sid: session.sid, expiresAt: session.expiresAt, role: user.role };
  },
});

export const revokeCredential = mutation({
  args: { actorToken: v.string(), credentialId: v.string() },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("passkey_credentials")
      .withIndex("by_credentialId", (q) => q.eq("credentialId", args.credentialId))
      .unique();
    if (credential === null) throw new ConvexError("credential not found");

    const credentialUser = await ctx.db.get(credential.userId);
    if (credentialUser === null) throw new ConvexError("user not found");

    const adminUser = await requireAdminUser(ctx, args.actorToken);
    if (adminUser.institutionId !== credentialUser.institutionId) {
      throw new ConvexError("unauthorized");
    }

    const now = Date.now();
    let revokedSessions = 0;
    if (credential.revokedAt === undefined) {
      await ctx.db.patch(credential._id, { revokedAt: now });
    }
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", credential.userId))
      .collect();
    for (const session of sessions) {
      if (
        session.credentialId !== credential.credentialId ||
        session.revokedAt !== undefined ||
        session.expiresAt <= now
      ) {
        continue;
      }
      await ctx.db.patch(session._id, { revokedAt: now });
      revokedSessions += 1;
    }

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: credentialUser.institutionId,
      category: "identity",
      type: "identity.passkey_revoked",
      actorUserId: adminUser._id,
      subjectUserId: credential.userId,
      payload: { credentialId: credential.credentialId, revokedSessions },
    });

    return { ok: true as const };
  },
});
