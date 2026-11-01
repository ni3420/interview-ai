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

/** Env without which a job cannot finish: both remote calls would be refused. */
const REQUIRED_VARS = [
  "AI_SERVICE_API_KEY",
  "WORKER_SERVICE_KEY",
  "CONVEX_SITE_URL",
] as const;

const POSITIVE_INT_VARS = [
  "AI_REQUEST_TIMEOUT_MS",
  "REPORT_AI_REQUEST_TIMEOUT_MS",
  "WORKER_CONCURRENCY",
  "REPORT_WORKER_CONCURRENCY",
] as const;

/**
 * Problems that make a worker job unable to complete.
 *
 * A missing `CONVEX_SITE_URL` used to fall through to "skip persistence", so the
 * paid AI calls ran and the result was thrown away while the job reported
 * success. Startup fails on these instead of degrading silently.
 */
export function workerConfigProblems(
  source: Record<string, string | undefined> = process.env
): string[] {
  const problems: string[] = [];

  for (const name of REQUIRED_VARS) {
    if (!source[name]?.trim()) problems.push(`${name} is required`);
  }

  const siteUrl = source.CONVEX_SITE_URL?.trim();
  if (siteUrl) {
    let valid = false;
    try {
      const protocol = new URL(siteUrl).protocol;
      valid = protocol === "http:" || protocol === "https:";
    } catch {
      valid = false;
    }
    if (!valid) {
      problems.push("CONVEX_SITE_URL must be an http(s) URL");
    }
  }

  for (const name of POSITIVE_INT_VARS) {
    const raw = source[name]?.trim();
    if (!raw) continue;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      problems.push(`${name} must be a positive integer`);
    }
  }

  return problems;
}

export const config = {
  /** Valkey/Redis connection (BullMQ queue backend). */
  redisUrl: env("REDIS_URL", "redis://localhost:6379"),

  /** Queue consumed by this worker. */
  queueName: env("RESUME_QUEUE_NAME", "resume-processing"),

  /** Queue for asynchronous interview report generation. */
  reportQueueName: env("REPORT_QUEUE_NAME", "report-evaluation"),

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

  /** Report evaluation can produce more output than a plan; keep a budget. */
  reportAiRequestTimeoutMs: intEnv("REPORT_AI_REQUEST_TIMEOUT_MS", 900_000),

  workerConcurrency: intEnv("WORKER_CONCURRENCY", 2),

  // Report evaluations are CPU-heavy. Process one at a time by default so two
  // local-model runs do not starve each other.
  reportWorkerConcurrency: intEnv("REPORT_WORKER_CONCURRENCY", 1),
} as const;
