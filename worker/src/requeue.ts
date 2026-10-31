/**
 * Operator retry for retained failed jobs.
 *
 * BullMQ keeps failed jobs (`removeOnFail`), but nothing in the app retries
 * them after the attempts budget is spent. Run this with Redis access:
 *
 *   node dist/requeue.js [--queue resume|report] [--job <id>] [--limit 100]
 *
 * Every retried job re-enters the normal queue and its handler is idempotent.
 */

import { Queue } from "bullmq";
import { config } from "./config";
import { createRedisConnection } from "./redis";

const QUEUE_ALIASES = {
  resume: config.queueName,
  report: config.reportQueueName,
} as const;

export type QueueAlias = keyof typeof QUEUE_ALIASES;

export interface RequeueOptions {
  queueName: string;
  jobId?: string;
  limit: number;
}

export function parseRequeueArgs(argv: string[]): RequeueOptions {
  const options: RequeueOptions = {
    queueName: QUEUE_ALIASES.resume,
    limit: 100,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--queue") {
      const alias = argv[i + 1] as QueueAlias | undefined;
      if (!alias || !(alias in QUEUE_ALIASES)) {
        throw new Error("--queue must be 'resume' or 'report'");
      }
      options.queueName = QUEUE_ALIASES[alias];
      i += 1;
    } else if (arg === "--job") {
      const jobId = argv[i + 1];
      if (!jobId) throw new Error("--job requires an id");
      options.jobId = jobId;
      i += 1;
    } else if (arg === "--limit") {
      const limit = Number.parseInt(argv[i + 1] ?? "", 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error("--limit must be a positive integer");
      }
      options.limit = limit;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  let options: RequeueOptions;
  try {
    options = parseRequeueArgs(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "invalid requeue arguments",
        error: error instanceof Error ? error.message : String(error),
      })
    );
    process.exitCode = 2;
    return;
  }

  const connection = createRedisConnection();
  const queue = new Queue(options.queueName, { connection });

  try {
    const failed = await queue.getFailed(0, options.limit - 1);
    const targets = options.jobId
      ? failed.filter((job) => job.id === options.jobId)
      : failed;

    if (targets.length === 0) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "no failed jobs matched",
          queue: options.queueName,
          jobId: options.jobId,
        })
      );
      process.exitCode = 1;
      return;
    }

    for (const job of targets) {
      await job.retry();
      console.log(
        JSON.stringify({
          level: "info",
          message: "job requeued",
          queue: options.queueName,
          jobId: job.id,
        })
      );
    }
  } finally {
    await queue.close();
    await connection.quit();
  }
}

if (require.main === module) {
  void main();
}
