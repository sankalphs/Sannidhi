import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdminUser, resolveActorUser } from "./lib/actor";

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
