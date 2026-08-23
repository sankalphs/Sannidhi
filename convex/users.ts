import { v } from "convex/values";

import { query } from "./_generated/server";

export const listUsers = query({
  args: { institutionId: v.id("institutions") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("users")
      .withIndex("by_institution", (q) => q.eq("institutionId", args.institutionId))
      .collect();
  },
});

export const getDefaultInstitution = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("institutions").first();
  },
});
