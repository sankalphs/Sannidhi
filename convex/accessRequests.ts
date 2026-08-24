import { ConvexError, v } from "convex/values";

import type { ActorTokenClaims } from "../src/lib/auth/actor-token";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { verifyActorToken } from "./lib/actor";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LISTED_REQUESTS = 100;
const MAX_REQUESTS_PER_EMAIL_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const requestedRoleValidator = v.union(
  v.literal("administrator"),
  v.literal("faculty"),
  v.literal("department_authority"),
  v.literal("other"),
);

async function requireAdminActor(actorToken: string): Promise<ActorTokenClaims> {
  try {
    const claims = await verifyActorToken(actorToken);
    if (claims.role !== "admin") throw new Error("wrong role");
    return claims;
  } catch {
    throw new ConvexError("unauthorized");
  }
}

export const submit = mutation({
  args: {
    institution: v.string(),
    name: v.string(),
    email: v.string(),
    requestedRole: requestedRoleValidator,
    note: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    // Honeypot: real users never fill this hidden field.
    if (args.website !== undefined && args.website.trim().length > 0) {
      return { ok: true };
    }

    const institution = args.institution.trim();
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const note = args.note?.trim();

    if (institution.length < 2 || institution.length > 200) {
      throw new ConvexError("Institution name must be between 2 and 200 characters");
    }
    if (name.length < 2 || name.length > 120) {
      throw new ConvexError("Your name must be between 2 and 120 characters");
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new ConvexError("Enter a valid email address");
    }
    if (note !== undefined && note.length > 1000) {
      throw new ConvexError("Notes are limited to 1000 characters");
    }

    const dayAgo = Date.now() - DAY_MS;
    const recent = await ctx.db
      .query("access_requests")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const recentCount = recent.filter((request) => request.submittedAt >= dayAgo).length;
    if (recentCount >= MAX_REQUESTS_PER_EMAIL_PER_DAY) {
      throw new ConvexError("Too many requests from this email. Try again tomorrow.");
    }

    await ctx.db.insert("access_requests", {
      institution,
      name,
      email,
      requestedRole: args.requestedRole,
      ...(note !== undefined && note.length > 0 ? { note } : {}),
      status: "new",
      submittedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const list = query({
  args: { actorToken: v.string() },
  returns: v.array(
    v.object({
      id: v.id("access_requests"),
      institution: v.string(),
      name: v.string(),
      email: v.string(),
      requestedRole: requestedRoleValidator,
      note: v.optional(v.string()),
      status: v.union(v.literal("new"), v.literal("reviewed")),
      submittedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAdminActor(args.actorToken);
    const requests = await ctx.db
      .query("access_requests")
      .withIndex("by_status_submitted", (q) => q.eq("status", "new"))
      .order("desc")
      .take(MAX_LISTED_REQUESTS);
    if (requests.length >= MAX_LISTED_REQUESTS) {
      return requests.map((request) => ({
        id: request._id as Id<"access_requests">,
        institution: request.institution,
        name: request.name,
        email: request.email,
        requestedRole: request.requestedRole,
        note: request.note,
        status: request.status,
        submittedAt: request.submittedAt,
      }));
    }
    const reviewed = await ctx.db
      .query("access_requests")
      .withIndex("by_status_submitted", (q) => q.eq("status", "reviewed"))
      .order("desc")
      .take(MAX_LISTED_REQUESTS - requests.length);
    return [...requests, ...reviewed].map((request) => ({
      id: request._id as Id<"access_requests">,
      institution: request.institution,
      name: request.name,
      email: request.email,
      requestedRole: request.requestedRole,
      note: request.note,
      status: request.status,
      submittedAt: request.submittedAt,
    }));
  },
});

export const markReviewed = mutation({
  args: { actorToken: v.string(), requestId: v.id("access_requests") },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requireAdminActor(args.actorToken);
    const request = await ctx.db.get(args.requestId);
    if (request === null) throw new ConvexError("Request not found");
    if (request.status === "reviewed") return { ok: true };
    await ctx.db.patch(args.requestId, { status: "reviewed", reviewedAt: Date.now() });
    return { ok: true };
  },
});
