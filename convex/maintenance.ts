import {
  SESSION_CHALLENGE_RETENTION_MS,
  SESSION_WINDOW_GRACE_MS,
} from "../src/lib/session-challenge/config";
import { internalMutation } from "./_generated/server";

const MAX_CHALLENGE_PRUNES_PER_RUN = 200;
const MAX_SESSION_AUTOCLOSES_PER_RUN = 100;
const BATCH_SIZE = 50;

export const expireStaleChallenges = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - SESSION_CHALLENGE_RETENTION_MS;

    let prunedChallenges = 0;
    pruneLoop: for (;;) {
      const batch = await ctx.db
        .query("session_challenges")
        .withIndex("by_expiresAt", (q) => q.lt("expiresAt", cutoff))
        .take(BATCH_SIZE);
      if (batch.length === 0) break;
      for (const challenge of batch) {
        await ctx.db.delete(challenge._id);
        prunedChallenges += 1;
        if (prunedChallenges >= MAX_CHALLENGE_PRUNES_PER_RUN) break pruneLoop;
      }
    }

    let autoClosedSessions = 0;
    const graceCutoff = now - SESSION_WINDOW_GRACE_MS;
    closeLoop: for (;;) {
      const batch = await ctx.db
        .query("class_sessions")
        .withIndex("by_status_windowEndsAt", (q) =>
          q.eq("status", "active").lt("windowEndsAt", graceCutoff),
        )
        .take(Math.min(BATCH_SIZE, MAX_SESSION_AUTOCLOSES_PER_RUN - autoClosedSessions));
      if (batch.length === 0) break;
      for (const session of batch) {
        await ctx.db.patch(session._id, { status: "closed", closedAt: now });
        autoClosedSessions += 1;
        if (autoClosedSessions >= MAX_SESSION_AUTOCLOSES_PER_RUN) break closeLoop;
      }
    }

    return {
      prunedChallenges,
      autoClosedSessions,
      challengesRemaining: prunedChallenges >= MAX_CHALLENGE_PRUNES_PER_RUN,
      sessionsRemaining: autoClosedSessions >= MAX_SESSION_AUTOCLOSES_PER_RUN,
    };
  },
});
