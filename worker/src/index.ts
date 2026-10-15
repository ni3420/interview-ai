import { Worker } from "bullmq";
import { config } from "./config";
import { processResumeJob } from "./processor";
import { createRedisConnection } from "./redis";

function log(message: string, meta?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: "info", message, ...meta }));
}

const connection = createRedisConnection();

const worker = new Worker(config.queueName, processResumeJob, {
  connection,
  concurrency: config.workerConcurrency,
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
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: error.message,
    })
  );
});

worker.on("error", (error) => {
  console.error(
    JSON.stringify({ level: "error", message: "worker error", error: error.message })
  );
});

async function shutdown(signal: string): Promise<void> {
  log("shutting down", { signal });
  try {
    await worker.close();
    await connection.quit();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log("worker started", {
  queue: config.queueName,
  concurrency: config.workerConcurrency,
  aiServiceUrl: config.aiServiceUrl,
});
