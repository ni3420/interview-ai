import { Worker } from "bullmq";
import { config } from "./config";
import { processResumeJob, reportTerminalFailure } from "./processor";
import {
  processReportJob,
  reportEvaluationTerminalFailure,
} from "./report-processor";
import { createRedisConnection } from "./redis";

function log(message: string, meta?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", message, ...meta }));
}

const connection = createRedisConnection();
const worker = new Worker(config.queueName, processResumeJob, {
  connection,
  concurrency: config.workerConcurrency,
});

const reportConnection = createRedisConnection();
const reportWorker = new Worker(config.reportQueueName, processReportJob, {
  connection: reportConnection,
  concurrency: config.reportWorkerConcurrency,
});

worker.on("ready", () => log("worker ready", { queue: config.queueName }));

worker.on("completed", (job, result) =>
  log("job completed", { jobId: job.id, result })
);

worker.on("failed", (job, error) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "job failed",
      queue: config.queueName,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      attempts: job?.opts.attempts,
      error: error.message,
    })
  );

  // Only the terminal failure is reported to Convex, so the UI is not marked
  // failed while BullMQ still has retries left. This also covers stalls and
  // jobs interrupted by a worker restart.
  if (job) {
    void reportTerminalFailure(job, error);
  }
});

worker.on("error", (error) => {
  console.error(
    JSON.stringify({ level: "error", message: "worker error", error: error.message })
  );
});

reportWorker.on("ready", () =>
  log("report worker ready", { queue: config.reportQueueName })
);

reportWorker.on("completed", (job, result) =>
  log("report job completed", { jobId: job.id, result })
);

reportWorker.on("failed", (job, error) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "report job failed",
      queue: config.reportQueueName,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      attempts: job?.opts.attempts,
      error: error.message,
    })
  );

  if (job) {
    void reportEvaluationTerminalFailure(job, error);
  }
});

reportWorker.on("error", (error) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: "report worker error",
      error: error.message,
    })
  );
});

async function shutdown(signal: string): Promise<void> {
  log("shutting down", { signal });
  try {
    await Promise.all([worker.close(), reportWorker.close()]);
    await Promise.all([connection.quit(), reportConnection.quit()]);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log("worker started", {
  queue: config.queueName,
  reportQueue: config.reportQueueName,
  concurrency: config.workerConcurrency,
  reportConcurrency: config.reportWorkerConcurrency,
  aiServiceUrl: config.aiServiceUrl,
});
