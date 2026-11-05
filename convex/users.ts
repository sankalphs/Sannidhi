import { ConvexError, v } from "convex/values";

import { statusChangeRefusal } from "../src/lib/users/status-change";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { assertSameInstitution, requireAdminUser, resolveActorUser } from "./lib/actor";

const roleValidator = v.union(
  v.literal("student"),
  v.literal("faculty"),
  v.literal("department_authority"),
  v.literal("admin"),
  v.literal("auditor"),
);

export const listUsers = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdminUser(ctx, args.actorToken);
    return ctx.db
      .query("users")
      .withIndex("by_institution", (q) => q.eq("institutionId", admin.institutionId))
      .collect();
  },
});

export const getMyInstitution = query({
  args: { actorToken: v.string() },
  handler: async (ctx, args): Promise<Doc<"institutions"> | null> => {
    const user = await resolveActorUser(ctx, args.actorToken);
    if (user === null) throw new ConvexError("unauthorized");
    return ctx.db.get(user.institutionId);
  },
});

async function requireAdminAndTarget(
  ctx: MutationCtx,
  actorToken: string,
  userId: Id<"users">,
): Promise<{ admin: Doc<"users">; target: Doc<"users"> }> {
  const admin = await requireAdminUser(ctx, actorToken);
  const target = await ctx.db.get(userId);
  if (target === null) throw new ConvexError("user not found");
  assertSameInstitution(admin.institutionId, target.institutionId);
  return { admin, target };
}

/**
 * Suspends an active account (signing it out everywhere) or reactivates a
 * suspended one. Admin-only, same institution; admins cannot suspend
 * themselves. Not-yet-activated people are handled by revoking their invite.
 */
export const setUserStatus = mutation({
  args: {
    actorToken: v.string(),
    userId: v.id("users"),
    status: v.union(v.literal("active"), v.literal("suspended")),
  },
  handler: async (ctx, args) => {
    const { admin, target } = await requireAdminAndTarget(ctx, args.actorToken, args.userId);
    const refusal = statusChangeRefusal(target.status, args.status, target._id === admin._id);
    if (refusal !== null) throw new ConvexError(refusal);

    await ctx.db.patch(target._id, { status: args.status });
    const revokedSessions =
      args.status === "suspended"
        ? await ctx.runMutation(internal.sessions.revokeAllForUser, { userId: target._id })
        : 0;

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: target.institutionId,
      category: "identity",
      type: args.status === "suspended" ? "identity.user_suspended" : "identity.user_reactivated",
      actorUserId: admin._id,
      subjectUserId: target._id,
      payload: { email: target.email, revokedSessions },
    });
    return { ok: true as const };
  },
});

/**
 * Changes someone's role and signs them out so their next sign-in carries
 * it. Admin-only, same institution; admins cannot change their own role.
 */
export const setUserRole = mutation({
  args: { actorToken: v.string(), userId: v.id("users"), role: roleValidator },
  handler: async (ctx, args) => {
    const { admin, target } = await requireAdminAndTarget(ctx, args.actorToken, args.userId);
    if (target._id === admin._id) throw new ConvexError("you cannot change your own role");
    if (target.role === args.role) return { ok: true as const };

    await ctx.db.patch(target._id, { role: args.role });
    const revokedSessions = await ctx.runMutation(internal.sessions.revokeAllForUser, {
      userId: target._id,
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: target.institutionId,
      category: "identity",
      type: "identity.role_changed",
      actorUserId: admin._id,
      subjectUserId: target._id,
      payload: { email: target.email, from: target.role, to: args.role, revokedSessions },
    });
    return { ok: true as const };
  },
});

/**
 * Deletes someone who never activated — still "invited", with no attendance,
 * device, passkey, password or biometrics — and revokes their pending
 * invites; any roster enrollments go with them. Anyone with history is
 * refused (suspend them instead) so the evidence trail stays intact.
 */
export const removeInvitedUser = mutation({
  args: { actorToken: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const { admin, target } = await requireAdminAndTarget(ctx, args.actorToken, args.userId);
    if (target.status !== "invited") {
      throw new ConvexError(
        `${target.name} has already activated their account — suspend it instead of removing it`,
      );
    }
    const userId = target._id;
    const history = await Promise.all([
      ctx.db
        .query("attendance_events")
        .withIndex("by_student_section", (q) => q.eq("studentId", userId))
        .first(),
      ctx.db
        .query("devices")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("passkey_credentials")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("password_credentials")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("biometric_records")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
    ]);
    if (history.some((row) => row !== null)) {
      throw new ConvexError(
        `${target.name} has already started using Sannidhi — suspend the account instead of removing it`,
      );
    }
    const taughtSlot = await ctx.db
      .query("timetable_slots")
      .withIndex("by_faculty_day", (q) => q.eq("facultyId", userId))
      .first();
    if (taughtSlot !== null) {
      throw new ConvexError(
        `${target.name} is assigned to a timetable slot — reassign it on the Schedule page first`,
      );
    }

    const enrollments = await ctx.db
      .query("enrollments")
      .withIndex("by_student", (q) => q.eq("studentId", userId))
      .collect();
    for (const enrollment of enrollments) await ctx.db.delete(enrollment._id);

    const revokedInviteIds: Id<"invites">[] = [];
    const invites = await ctx.db
      .query("invites")
      .withIndex("by_email", (q) => q.eq("email", target.email))
      .collect();
    for (const invite of invites) {
      if (invite.institutionId !== target.institutionId || invite.status !== "pending") continue;
      await ctx.db.patch(invite._id, { status: "revoked" });
      revokedInviteIds.push(invite._id);
    }

    await ctx.db.delete(userId);
    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: target.institutionId,
      category: "identity",
      type: "identity.user_removed",
      actorUserId: admin._id,
      subjectUserId: userId,
      payload: {
        email: target.email,
        name: target.name,
        role: target.role,
        revokedInviteIds,
        removedEnrollments: enrollments.length,
      },
    });
    return { ok: true as const };
  },
});
