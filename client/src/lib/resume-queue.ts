import { Queue } from "bullmq";
import { Redis } from "ioredis";

/** Name of the BullMQ queue shared by this producer and the worker. */
export const RESUME_QUEUE_NAME = "resume-processing";

export interface ResumeJobPayload {
  /** Convex `resumes` document id. */
  resumeId: string;
  /** Convex `interviews` document id the questions belong to. */
  interviewId: string;
  /** Convex `users` document id (owner). */
  userId: string;
  /** Server-generated URL reachable by the containerised AI service. */
  fileUrl: string;
  /** Job description text used to ground question generation. */
  jobDescription: string;
}

/** Subset of the Convex processing context needed to build a job payload. */
export interface ResumeProcessingContext {
  resumeId: string;
  interviewId: string;
  userId: string;
  jobDescription: string;
}

/**
 * Builds the job payload for the worker. Kept in one place so the producer and
 * the worker's validated contract (`worker/src/job.ts`) cannot drift apart.
 */
export function buildResumeJob(
  context: ResumeProcessingContext,
  fileUrl: string
): ResumeJobPayload {
  return {
    resumeId: context.resumeId,
    interviewId: context.interviewId,
    userId: context.userId,
    fileUrl,
    jobDescription: context.jobDescription,
  };
}

// Reuse the connection/queue across HMR reloads and route invocations instead
// of opening a new Redis connection per request.
const globalForQueue = globalThis as unknown as {
  __resumeQueueConnection?: Redis;
  __resumeQueue?: Queue;
};

function getConnection(): Redis {
  if (!globalForQueue.__resumeQueueConnection) {
    globalForQueue.__resumeQueueConnection = new Redis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      { maxRetriesPerRequest: null }
    );
  }
  return globalForQueue.__resumeQueueConnection;
}

export function getResumeQueue(): Queue {
  if (!globalForQueue.__resumeQueue) {
    globalForQueue.__resumeQueue = new Queue(RESUME_QUEUE_NAME, {
      connection: getConnection(),
      defaultJobOptions: {
        // Bounded retries with exponential backoff; processing is idempotent.
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return globalForQueue.__resumeQueue;
}
