import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "mark stale users offline",
  { minutes: 1 },
  internal.internal.maintenance.markStaleUsersOffline,
  {},
);
crons.interval(
  "delete expired typing indicators",
  { minutes: 10 },
  internal.internal.maintenance.deleteExpiredTypingIndicators,
  {},
);

export default crons;
