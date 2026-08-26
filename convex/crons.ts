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

export default crons;
