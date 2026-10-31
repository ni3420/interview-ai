import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Closes the loop on jobs whose worker will never report back.
crons.interval(
  "sweep stale jobs",
  { minutes: 10 },
  internal.maintenance.sweepStaleJobs,
  {}
);

export default crons;
