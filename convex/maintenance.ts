import {
  SESSION_CHALLENGE_RETENTION_MS,
  SESSION_WINDOW_GRACE_MS,
} from "../src/lib/session-challenge/config";
import { internalMutation } from "./_generated/server";

export const expireStaleChallenges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const staleChallenges = await ctx.db
      .query("session_challenges")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - SESSION_CHALLENGE_RETENTION_MS))
      .collect();
    for (const challenge of staleChallenges) {
      await ctx.db.delete(challenge._id);
    }
    const expiredSessions = await ctx.db
      .query("class_sessions")
      .withIndex("by_windowEndsAt", (q) => q.lt("windowEndsAt", now - SESSION_WINDOW_GRACE_MS))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
    for (const session of expiredSessions) {
      await ctx.db.patch(session._id, { status: "closed", closedAt: now });
    }
    return {
      prunedChallenges: staleChallenges.length,
      autoClosedSessions: expiredSessions.length,
    };
  },
});
