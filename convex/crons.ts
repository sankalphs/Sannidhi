import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire-stale-session-challenges",
  { minutes: 2 },
  internal.maintenance.expireStaleChallenges,
);

crons.interval(
  "expire-stale-verification-challenges",
  { minutes: 1 },
  internal.challenges.expireStaleChallenges,
);

crons.daily(
  "prune-expired-audit-events",
  { hourUTC: 3, minuteUTC: 30 },
  internal.maintenance.pruneExpiredAuditEvents,
);

crons.daily(
  "scan-review-alerts",
  { hourUTC: 4, minuteUTC: 0 },
  internal.reviewAlerts.scanReviewAlerts,
);

export default crons;
