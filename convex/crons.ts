import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "expire-stale-session-challenges",
  { minutes: 2 },
  internal.maintenance.expireStaleChallenges,
);

export default crons;
