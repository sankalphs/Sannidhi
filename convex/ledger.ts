import { ConvexError, v } from "convex/values";

import {
  computeEventHash,
  type LedgerHashInput,
  type LedgerEventCategory,
} from "../src/lib/ledger/hash";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { resolveActorUser } from "./lib/actor";

const categoryValidator = v.union(
  v.literal("device"),
  v.literal("identity"),
  v.literal("attendance"),
);

export const appendLedgerEvent = internalMutation({
  args: {
    institutionId: v.id("institutions"),
    category: categoryValidator,
    type: v.string(),
    actorUserId: v.optional(v.id("users")),
    subjectUserId: v.optional(v.id("users")),
    deviceId: v.optional(v.id("devices")),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const last = await ctx.db
      .query("event_ledger")
      .withIndex("by_institution_seq", (q) => q.eq("institutionId", args.institutionId))
      .order("desc")
      .first();

    const seq = last !== null ? last.seq + 1 : 0;
    const prevEventHash = last?.eventHash;
    const eventHash = await computeEventHash({ ...args, seq, prevEventHash });

    return ctx.db.insert("event_ledger", {
      ...args,
      seq,
      prevEventHash,
      eventHash,
      createdAt: Date.now(),
    });
  },
});

const MAX_VERIFY_WINDOW = 2000;

async function resolveCaller(ctx: QueryCtx, actorToken: string): Promise<Doc<"users">> {
  const user = await resolveActorUser(ctx, actorToken);
  if (user === null) throw new ConvexError("unauthorized");
  return user;
}

export const history = query({
  args: { actorToken: v.string(), subjectUserId: v.id("users") },
  handler: async (ctx, args) => {
    const caller = await resolveCaller(ctx, args.actorToken);
    if (caller._id !== args.subjectUserId && caller.role !== "admin" && caller.role !== "auditor") {
      throw new ConvexError("unauthorized");
    }
    return ctx.db
      .query("event_ledger")
      .withIndex("by_subject", (q) => q.eq("subjectUserId", args.subjectUserId))
      .collect();
  },
});

export const verifyChain = query({
  args: {
    actorToken: v.string(),
    fromSeq: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await resolveCaller(ctx, args.actorToken);
    if (caller.role !== "admin" && caller.role !== "auditor") {
      throw new ConvexError("unauthorized");
    }

    const fromSeq = Math.max(0, Math.floor(args.fromSeq ?? 0));
    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 500)), MAX_VERIFY_WINDOW);

    const events = await ctx.db
      .query("event_ledger")
      .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
      .filter((q) => q.gte(q.field("seq"), fromSeq))
      .order("asc")
      .take(limit + 1);

    let expectedSeq = fromSeq;
    let expectedPrevEventHash: string | undefined;

    for (const event of events.slice(0, limit)) {
      if (event.seq !== expectedSeq || event.prevEventHash !== expectedPrevEventHash) {
        return { valid: false, brokenAtSeq: event.seq, count: event.seq - fromSeq };
      }
      const input: LedgerHashInput = {
        institutionId: event.institutionId,
        category: event.category as LedgerEventCategory,
        type: event.type,
        actorUserId: event.actorUserId,
        subjectUserId: event.subjectUserId,
        deviceId: event.deviceId,
        payload: event.payload as Record<string, unknown>,
        seq: event.seq,
        prevEventHash: event.prevEventHash,
      };
      if ((await computeEventHash(input)) !== event.eventHash) {
        return { valid: false, brokenAtSeq: event.seq, count: event.seq - fromSeq };
      }
      expectedSeq += 1;
      expectedPrevEventHash = event.eventHash;
    }

    const verifiedCount = Math.min(events.length, limit);
    return {
      valid: true,
      brokenAtSeq: undefined,
      count: verifiedCount,
      ...(events.length > limit ? { nextCursor: events[limit - 1].seq + 1 } : {}),
    };
  },
});
