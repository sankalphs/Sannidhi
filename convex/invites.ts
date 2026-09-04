import { ConvexError, v } from "convex/values";

import type { ActorTokenClaims } from "../src/lib/auth/actor-token";
import { type Role } from "../src/lib/auth/session";
import { hashInviteToken, randomToken } from "../src/lib/invites/token";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { assertSameInstitution, requireAdminUser, verifyActorToken } from "./lib/actor";

const roleValidator = v.union(
  v.literal("student"),
  v.literal("faculty"),
  v.literal("department_authority"),
  v.literal("admin"),
  v.literal("auditor"),
);

const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 90;
const MAX_INVITES_PER_CALL = 500;
const MAX_LISTED_INVITES = 100;

type CreatedInvite = {
  email: string;
  userId: string | null;
  inviteId: string;
  token: string;
};

async function requireAdminActor(actorToken: string): Promise<ActorTokenClaims> {
  try {
    const claims = await verifyActorToken(actorToken);
    if (claims.role !== "admin") throw new Error("wrong role");
    return claims;
  } catch {
    throw new ConvexError("unauthorized");
  }
}

async function resolveActorUserId(
  ctx: MutationCtx,
  claims: ActorTokenClaims,
): Promise<Id<"users"> | undefined> {
  try {
    const user = await ctx.db.get(claims.userId as Id<"users">);
    return user !== null ? (claims.userId as Id<"users">) : undefined;
  } catch {
    return undefined;
  }
}

export type UserDoc = {
  _id: Id<"users">;
  institutionId: Id<"institutions">;
  email: string;
  status?: "invited" | "active" | "suspended";
};

export async function findPendingInviteForUser(
  ctx: QueryCtx | MutationCtx,
  user: Pick<UserDoc, "institutionId" | "email">,
): Promise<Doc<"invites"> | null> {
  const candidates = await ctx.db
    .query("invites")
    .withIndex("by_email", (q) => q.eq("email", user.email))
    .collect();
  const pending = candidates
    .filter((invite) => invite.institutionId === user.institutionId && invite.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
  return pending[0] ?? null;
}

export async function activateUserAndAcceptInvite(
  ctx: MutationCtx,
  args: { user: UserDoc; invite: Doc<"invites"> },
): Promise<void> {
  const { user, invite } = args;
  if (user.status === "suspended") throw new ConvexError("account suspended");
  if (invite.status !== "pending") throw new ConvexError("invite is not pending");
  if (invite.expiresAt <= Date.now()) {
    await ctx.db.patch(invite._id, { status: "expired" });
    throw new ConvexError("invite expired");
  }

  const now = Date.now();
  if (user.status !== "active") {
    await ctx.db.patch(user._id, { status: "active" });
  }
  await ctx.db.patch(invite._id, {
    status: "accepted",
    acceptedByUserId: user._id,
    acceptedAt: now,
  });

  await ctx.runMutation(internal.ledger.appendLedgerEvent, {
    institutionId: invite.institutionId,
    category: "identity",
    type: "invite.redeemed",
    actorUserId: user._id,
    subjectUserId: user._id,
    payload: { email: invite.email, role: invite.role, inviteId: invite._id },
  });
}

async function createSingleInvite(
  ctx: MutationCtx,
  args: {
    institutionId: Id<"institutions">;
    actorUserId: Id<"users"> | undefined;
    email: string;
    name: string;
    role: Role;
    expiresAt: number;
  },
): Promise<CreatedInvite> {
  const email = args.email.trim().toLowerCase();
  const existingUser = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();

  let userId: Id<"users"> | null = null;
  if (existingUser === null) {
    userId = await ctx.db.insert("users", {
      institutionId: args.institutionId,
      email,
      name: args.name.trim(),
      role: args.role,
      status: "invited",
      createdAt: Date.now(),
    });
  }

  const invitedByUserId =
    args.actorUserId ??
    userId ??
    (
      await ctx.db
        .query("users")
        .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
        .filter((q) => q.eq(q.field("role"), "admin"))
        .first()
    )?._id;
  if (invitedByUserId === undefined) {
    throw new ConvexError("cannot attribute invite without an admin user");
  }

  const token = randomToken();
  const tokenHash = await hashInviteToken(token);
  const createdAt = Date.now();
  const inviteId = await ctx.db.insert("invites", {
    institutionId: args.institutionId,
    email,
    role: args.role,
    tokenHash,
    status: "pending",
    invitedByUserId,
    createdAt,
    expiresAt: args.expiresAt,
  });

  await ctx.runMutation(internal.ledger.appendLedgerEvent, {
    institutionId: args.institutionId,
    category: "identity",
    type: "invite.created",
    actorUserId: args.actorUserId,
    subjectUserId: userId ?? undefined,
    payload: { email, role: args.role, inviteId, expiresAt: args.expiresAt },
  });

  return { email, userId, inviteId, token };
}

async function createInvitesInternal(
  ctx: MutationCtx,
  args: {
    actorToken: string;
    institutionId: Id<"institutions">;
    invites: { email: string; name: string; role: Role }[];
    ttlDays?: number;
  },
): Promise<CreatedInvite[]> {
  const admin = await requireAdminUser(ctx, args.actorToken);
  assertSameInstitution(admin.institutionId, args.institutionId);
  const claims = await verifyActorToken(args.actorToken);
  const institution = await ctx.db.get(args.institutionId);
  if (institution === null) throw new ConvexError("institution not found");
  if (args.invites.length === 0) throw new ConvexError("no invites provided");
  if (args.invites.length > MAX_INVITES_PER_CALL) {
    throw new ConvexError(`too many invites (max ${MAX_INVITES_PER_CALL} per call)`);
  }

  const ttlDays = args.ttlDays ?? DEFAULT_TTL_DAYS;
  if (!Number.isFinite(ttlDays) || ttlDays <= 0 || ttlDays > MAX_TTL_DAYS) {
    throw new ConvexError(`ttlDays must be between 1 and ${MAX_TTL_DAYS}`);
  }

  const actorUserId = await resolveActorUserId(ctx, claims);
  const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;

  const created: CreatedInvite[] = [];
  for (const invite of args.invites) {
    created.push(
      await createSingleInvite(ctx, {
        institutionId: args.institutionId,
        actorUserId,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        expiresAt,
      }),
    );
  }
  return created;
}

export const createInvites = mutation({
  args: {
    actorToken: v.string(),
    institutionId: v.id("institutions"),
    invites: v.array(v.object({ email: v.string(), name: v.string(), role: roleValidator })),
    ttlDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => createInvitesInternal(ctx, args),
});

export const listInvites = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx, args.actorToken);
    const statuses = ["pending", "accepted", "revoked", "expired"] as const;
    const invites: Doc<"invites">[] = [];
    for (const status of statuses) {
      const page = await ctx.db
        .query("invites")
        .withIndex("by_institution_status", (q) =>
          q.eq("institutionId", admin.institutionId).eq("status", status),
        )
        .order("desc")
        .take(MAX_LISTED_INVITES);
      invites.push(...page);
    }
    invites.sort((a, b) => b.createdAt - a.createdAt);
    const recent = invites.slice(0, MAX_LISTED_INVITES);

    const rows = [];
    for (const invite of recent) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", invite.email))
        .first();
      const sameInstitution = user !== null && user.institutionId === admin.institutionId;
      rows.push({
        inviteId: invite._id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        acceptedAt: invite.acceptedAt ?? null,
        userName: sameInstitution ? (user?.name ?? null) : null,
        userStatus: sameInstitution ? (user?.status ?? null) : null,
      });
    }
    return rows;
  },
});

export const revokeInvite = mutation({
  args: { actorToken: v.string(), inviteId: v.id("invites") },
  handler: async (ctx, args) => {
    const actor = await requireAdminActor(args.actorToken);
    const invite = await ctx.db.get(args.inviteId);
    if (invite === null) throw new ConvexError("invite not found");
    if (invite.status !== "pending") throw new ConvexError("invite is not pending");
    assertSameInstitution(
      (await requireAdminUser(ctx, args.actorToken)).institutionId,
      invite.institutionId,
    );

    await ctx.db.patch(args.inviteId, { status: "revoked" });
    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: invite.institutionId,
      category: "identity",
      type: "invite.revoked",
      actorUserId: await resolveActorUserId(ctx, actor),
      subjectUserId: undefined,
      payload: { email: invite.email, role: invite.role, inviteId: invite._id },
    });
    return { ok: true as const };
  },
});

export const validateInviteToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invalid = (reason: string) => ({ valid: false as const, reason });

    const tokenHash = await hashInviteToken(args.token);
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (invite === null) return invalid("not_found");
    if (invite.status === "accepted") return invalid("accepted");
    if (invite.status === "revoked") return invalid("revoked");
    if (invite.status === "expired" || invite.expiresAt <= Date.now()) return invalid("expired");

    const institution = await ctx.db.get(invite.institutionId);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", invite.email))
      .first();
    return {
      valid: true as const,
      email: invite.email,
      role: invite.role,
      institutionName: institution?.name ?? null,
      expiresAt: invite.expiresAt,
      userId: user !== null && user.institutionId === invite.institutionId ? user._id : null,
    };
  },
});
