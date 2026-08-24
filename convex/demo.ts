import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";

const DEMO_ROLES = v.union(v.literal("student"), v.literal("faculty"));

const DEMO_EMAILS = {
  student: "aarav.patel@sit.edu.in",
  faculty: "priya.menon@sit.edu.in",
} as const;

export const getDemoActor = query({
  args: { role: DEMO_ROLES },
  handler: async (ctx, args): Promise<{ userId: string; email: string } | null> => {
    if (process.env.SANNIDHI_DEMO_MODE !== "1") throw new ConvexError("unauthorized");
    const email = DEMO_EMAILS[args.role];
    const user: Doc<"users"> | null = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (user === null || user.status === "suspended") return null;
    return { userId: user._id, email: user.email };
  },
});
