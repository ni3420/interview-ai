import { Worker } from "bullmq";
import { config, workerConfigProblems } from "./config";
import { processResumeJob, reportTerminalFailure } from "./processor";
import {
  processReportJob,
  reportEvaluationTerminalFailure,
} from "./report-processor";
import { jobTiming } from "./log";
import {
  recordActive,
  recordCompleted,
  recordFailed,
  recordStalled,
  snapshot,
} from "./metrics";
import { createRedisConnection } from "./redis";

function log(message: string, meta?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", message, ...meta }));
}

function assertWorkerConfig(): void {
  const problems = workerConfigProblems();
  if (problems.length === 0) return;

  console.error(
    JSON.stringify({
      level: "error",
      message: "worker configuration is invalid; refusing to start",
      problems,
    })
  );
  process.exit(1);
}

assertWorkerConfig();

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

worker.on("active", () => recordActive("resume"));

worker.on("completed", (job, result) => {
  recordCompleted("resume");
  log("job completed", { jobId: job.id, result, ...jobTiming(job) });
});

worker.on("stalled", (jobId) => {
  recordStalled("resume");
  console.error(
    JSON.stringify({
      level: "error",
      message: "resume job stalled",
      queue: config.queueName,
      jobId,
    })
  );
});

worker.on("failed", (job, error) => {
  recordFailed("resume");
  console.error(
    JSON.stringify({
      level: "error",
      message: "job failed",
      queue: config.queueName,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      attempts: job?.opts.attempts,
      error: error.message,
      ...(job ? jobTiming(job) : {}),
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

reportWorker.on("active", () => recordActive("report"));

reportWorker.on("completed", (job, result) => {
  recordCompleted("report");
  log("report job completed", { jobId: job.id, result, ...jobTiming(job) });
});

reportWorker.on("stalled", (jobId) => {
  recordStalled("report");
  console.error(
    JSON.stringify({
      level: "error",
      message: "report job stalled",
      queue: config.reportQueueName,
      jobId,
    })
  );
});

reportWorker.on("failed", (job, error) => {
  recordFailed("report");
  console.error(
    JSON.stringify({
      level: "error",
      message: "report job failed",
      queue: config.reportQueueName,
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      attempts: job?.opts.attempts,
      error: error.message,
      ...(job ? jobTiming(job) : {}),
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

// One line a minute is enough to see a worker that has stopped draining work
// or is failing every job. `unref` keeps it from holding the process open.
const heartbeat = setInterval(() => {
  log("worker heartbeat", {
    uptimeSeconds: Math.round(process.uptime()),
    queues: snapshot(),
  });
}, 60_000);
heartbeat.unref();

async function shutdown(signal: string): Promise<void> {
  log("shutting down", { signal });
  clearInterval(heartbeat);
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
