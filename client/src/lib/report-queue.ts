import { Queue } from "bullmq";
import { Redis } from "ioredis";

/** Name of the BullMQ queue shared by this producer and the worker. */
export const REPORT_QUEUE_NAME = "report-evaluation";

export interface ReportJobPayload {
  /** Convex `interviews` document id to evaluate. */
  interviewId: string;
}

/**
 * Builds the worker job payload. Resume text and answers are deliberately not
 * included: the worker fetches them from Convex over the authenticated bridge,
 * so personal data never sits in Redis.
 */
export function buildReportJob(interviewId: string): ReportJobPayload {
  return { interviewId };
}

// Reuse the connection/queue across HMR reloads and route invocations instead
// of opening a new Redis connection per request.
const globalForQueue = globalThis as unknown as {
  __reportQueueConnection?: Redis;
  __reportQueue?: Queue;
};

function getConnection(): Redis {
  if (!globalForQueue.__reportQueueConnection) {
    globalForQueue.__reportQueueConnection = new Redis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      { maxRetriesPerRequest: null }
    );
  }
  return globalForQueue.__reportQueueConnection;
}

export function getReportQueue(): Queue {
  if (!globalForQueue.__reportQueue) {
    globalForQueue.__reportQueue = new Queue(REPORT_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        // An evaluation is expensive (local inference can take minutes), so
        // allow one retry for transient model/Convex failures, not more.
        attempts: 2,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    });
  }
  return globalForQueue.__reportQueue;
}
