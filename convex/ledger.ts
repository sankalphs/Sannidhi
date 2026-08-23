import { v } from "convex/values";

import {
  computeEventHash,
  type LedgerHashInput,
  type LedgerEventCategory,
} from "../src/lib/ledger/hash";
import { internalMutation, query } from "./_generated/server";

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

export const history = query({
  args: { subjectUserId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("event_ledger")
      .withIndex("by_subject", (q) => q.eq("subjectUserId", args.subjectUserId))
      .collect();
  },
});

export const verifyChain = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("event_ledger")
      .withIndex("by_institution_seq", (q) => q.eq("institutionId", args.institutionId))
      .order("asc")
      .collect();

    let expectedSeq = 0;
    let expectedPrevEventHash: string | undefined;

    for (const event of events) {
      if (event.seq !== expectedSeq || event.prevEventHash !== expectedPrevEventHash) {
        return { valid: false, brokenAtSeq: event.seq, count: events.length };
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
        return { valid: false, brokenAtSeq: event.seq, count: events.length };
      }
      expectedSeq += 1;
      expectedPrevEventHash = event.eventHash;
    }

    return { valid: true, brokenAtSeq: undefined, count: events.length };
  },
});
