import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireActorUserWithActiveSession } from "./lib/actor";

const MAX_REASON_LENGTH = 1000;
const MIN_REASON_LENGTH = 10;
const MAX_LISTED_REQUESTS = 50;
const MAX_PENDING_REQUESTS = 10;

const requestTypeValidator = v.union(
  v.literal("correction"),
  v.literal("exemption"),
  v.literal("on_duty"),
);

async function requireStudent(
  ctx: MutationCtx | QueryCtx,
  actorToken: string,
): Promise<Doc<"users">> {
  const user = await requireActorUserWithActiveSession(ctx, actorToken).catch(() => null);
  if (user === null) throw new ConvexError("unauthorized");
  if (user.role !== "student") throw new ConvexError("unauthorized");
  return user;
}

export const submitMyRequest = mutation({
  args: {
    actorToken: v.string(),
    type: requestTypeValidator,
    reason: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const caller = await requireStudent(ctx, args.actorToken);

    const reason = args.reason.trim();
    if (reason.length < MIN_REASON_LENGTH) {
      throw new ConvexError(`Reason must be at least ${MIN_REASON_LENGTH} characters`);
    }
    if (reason.length > MAX_REASON_LENGTH) {
      throw new ConvexError(`Reason is limited to ${MAX_REASON_LENGTH} characters`);
    }

    const pending = await ctx.db
      .query("attendance_requests")
      .withIndex("by_student_status_requested", (q) =>
        q.eq("studentId", caller._id).eq("status", "submitted"),
      )
      .take(MAX_PENDING_REQUESTS + 1);
    if (pending.length >= MAX_PENDING_REQUESTS) {
      throw new ConvexError(
        `You already have ${MAX_PENDING_REQUESTS} open requests. Wait until they are reviewed.`,
      );
    }

    const requestedAt = Date.now();
    await ctx.db.insert("attendance_requests", {
      institutionId: caller.institutionId,
      studentId: caller._id,
      type: args.type,
      reason,
      status: "submitted",
      requestedAt,
    });

    await ctx.runMutation(internal.ledger.appendLedgerEvent, {
      institutionId: caller.institutionId,
      category: "attendance",
      type: "attendance_request_filed",
      actorUserId: caller._id,
      subjectUserId: caller._id,
      payload: { requestType: args.type },
    });

    return { ok: true };
  },
});

export const listMyRequests = query({
  args: { actorToken: v.string() },
  returns: v.array(
    v.object({
      id: v.id("attendance_requests"),
      type: requestTypeValidator,
      reason: v.string(),
      status: v.union(v.literal("submitted"), v.literal("reviewed")),
      requestedAt: v.number(),
      reviewedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const caller = await requireStudent(ctx, args.actorToken);
    const requests = await ctx.db
      .query("attendance_requests")
      .withIndex("by_student_requested", (q) => q.eq("studentId", caller._id))
      .order("desc")
      .take(MAX_LISTED_REQUESTS);
    return requests.map((request) => ({
      id: request._id,
      type: request.type,
      reason: request.reason,
      status: request.status,
      requestedAt: request.requestedAt,
      reviewedAt: request.reviewedAt,
    }));
  },
});
