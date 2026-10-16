/**
 * Worker configuration, read once at startup.
 *
 * Service keys come from the environment and are never baked into the image.
 */

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  /** Valkey/Redis connection (BullMQ queue backend). */
  redisUrl: env("REDIS_URL", "redis://localhost:6379"),

  /** Queue consumed by this worker. */
  queueName: env("RESUME_QUEUE_NAME", "resume-processing"),

  /** Python AI service. */
  aiServiceUrl: env("AI_SERVICE_URL", "http://localhost:8000").replace(/\/$/, ""),
  aiServiceApiKey: env("AI_SERVICE_API_KEY"),

  /** Convex HTTP actions site URL, used to persist processing results. */
  convexSiteUrl: env("CONVEX_SITE_URL").replace(/\/$/, ""),
  workerServiceKey: env("WORKER_SERVICE_KEY"),

  /**
   * Upper bound for a single AI service call. Local CPU inference can take
   * several minutes, so this is intentionally generous.
   */
  aiRequestTimeoutMs: intEnv("AI_REQUEST_TIMEOUT_MS", 900_000),

  workerConcurrency: intEnv("WORKER_CONCURRENCY", 2),
} as const;
