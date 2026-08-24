import { ConvexError, v } from "convex/values";

import {
  computeEventHash,
  type LedgerHashInput,
  type LedgerEventCategory,
} from "../src/lib/ledger/hash";
import type { Doc, Id } from "./_generated/dataModel";
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
const MAX_LEDGER_PAGE = 200;

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
    if (caller._id !== args.subjectUserId) {
      const subject = await ctx.db.get(args.subjectUserId);
      if (subject === null || subject.institutionId !== caller.institutionId) {
        throw new ConvexError("unauthorized");
      }
    }
    return ctx.db
      .query("event_ledger")
      .withIndex("by_subject", (q) => q.eq("subjectUserId", args.subjectUserId))
      .collect();
  },
});

async function safeGetUser(
  ctx: QueryCtx,
  userId: Id<"users"> | undefined,
): Promise<Doc<"users"> | null> {
  if (userId === undefined) return null;
  try {
    return await ctx.db.get(userId);
  } catch {
    return null;
  }
}

export const listLedgerEvents = query({
  args: {
    actorToken: v.string(),
    limit: v.optional(v.number()),
    cursorSeq: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const caller = await resolveCaller(ctx, args.actorToken);
    if (caller.role !== "admin" && caller.role !== "auditor") {
      throw new ConvexError("unauthorized");
    }

    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 100)), MAX_LEDGER_PAGE);
    const cursorSeq = args.cursorSeq;

    const rows = await ctx.db
      .query("event_ledger")
      .withIndex("by_institution_seq", (q) =>
        cursorSeq !== undefined
          ? q.eq("institutionId", caller.institutionId).lt("seq", cursorSeq)
          : q.eq("institutionId", caller.institutionId),
      )
      .order("desc")
      .take(limit);

    const events = await Promise.all(
      rows.map(async (row) => {
        const [subject, actor] = await Promise.all([
          safeGetUser(ctx, row.subjectUserId),
          safeGetUser(ctx, row.actorUserId),
        ]);
        return {
          _id: row._id,
          seq: row.seq,
          createdAt: row.createdAt,
          category: row.category,
          type: row.type,
          eventHash: row.eventHash,
          payload: row.payload,
          subjectName: subject?.name ?? null,
          subjectEmail: subject?.email ?? null,
          actorName: actor?.name ?? null,
        };
      }),
    );

    return {
      events,
      ...(events.length === limit ? { nextCursor: events[events.length - 1].seq } : {}),
    };
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

    let expectedPrevEventHash: string | undefined;
    if (fromSeq > 0) {
      const predecessor = await ctx.db
        .query("event_ledger")
        .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
        .filter((q) => q.eq(q.field("seq"), fromSeq - 1))
        .first();
      if (predecessor === undefined || predecessor === null) {
        return { valid: false, brokenAtSeq: fromSeq - 1, count: 0 };
      }
      expectedPrevEventHash = predecessor.eventHash;
    }

    const events = await ctx.db
      .query("event_ledger")
      .withIndex("by_institution_seq", (q) => q.eq("institutionId", caller.institutionId))
      .filter((q) => q.gte(q.field("seq"), fromSeq))
      .order("asc")
      .take(limit + 1);

    let expectedSeq = fromSeq;

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
