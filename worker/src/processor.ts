import type { Job } from "bullmq";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { config } from "./config";
import { resumeJobSchema, type ResumeJob } from "./job";

export interface ResumeProcessResult {
  chunkCount: number;
  questionCount: number;
}

interface ResumeProcessResponse {
  resume_id: string;
  text: string;
  chunk_count: number;
  embedding_model: string;
  embedding_dimension: number;
}

interface InterviewPlanResponse {
  questions: string[];
  focus_areas: string[];
}

interface RetrieveChunk {
  text: string;
  chunk_index: number;
  score: number;
}

interface RetrieveResponse {
  chunks: RetrieveChunk[];
}

/**
 * Minimal JSON POST helper.
 *
 * Deliberately does NOT use the global `fetch`: undici applies a 5 minute
 * `headersTimeout`, which a slow local model (minutes per plan) can exceed even
 * though the request is healthy. This uses a single total timeout instead.
 */
function postJson<TResponse>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number = config.aiRequestTimeoutMs
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = JSON.stringify(body);
    const client = target.protocol === "https:" ? https : http;

    const request = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(
              new Error(
                `Request to ${url} failed (${status}): ${text.slice(0, 200)}`
              )
            );
            return;
          }
          try {
            resolve(JSON.parse(text) as TResponse);
          } catch {
            reject(new Error(`Invalid JSON response from ${url}`));
          }
        });
      }
    );

    // A single total timeout; there is no inactivity timeout so a slow but
    // healthy generation is never cut off early.
    const timer = setTimeout(() => {
      request.destroy(
        new Error(`Request to ${url} timed out after ${timeoutMs}ms`)
      );
    }, timeoutMs);

    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on("close", () => clearTimeout(timer));

    request.write(payload);
    request.end();
  });
}

/** States BullMQ uses when another attempt is still scheduled. */
const RETRY_STATES = new Set(["delayed", "waiting", "prioritized", "waiting-children"]);

type FailureProbe = Pick<Job, "getState" | "attemptsMade" | "opts">;

/**
 * Decides whether a failed job is finished for good.
 *
 * Ask the queue for the job's post-failure state instead of inferring it from
 * the error message or attempt counters. `getState()` is authoritative for
 * every failure mode: exhausted retries, stalled jobs, and jobs interrupted by
 * a worker restart (which never run the processor at all). A job that is
 * waiting/delayed has another attempt scheduled; anything else (failed, or
 * already removed by `removeOnFail`) is terminal.
 *
 * Falls back to attempt accounting only if Redis cannot answer, so a queue
 * outage cannot silence a real failure report.
 */
export async function isTerminalFailure(job: FailureProbe): Promise<boolean> {
  try {
    const state = await job.getState();
    return !RETRY_STATES.has(state);
  } catch {
    return job.attemptsMade >= (job.opts.attempts ?? 1);
  }
}

/**
 * Tells Convex that a resume job has terminally failed so the lobby shows an
 * actionable error instead of waiting on progress that will never arrive.
 *
 * Called from the BullMQ `failed` event rather than the processor: that event
 * also fires for stalled jobs and jobs interrupted by a worker restart, which
 * never reach the processor's own error handling.
 *
 * Intermediate attempts are deliberately not reported. BullMQ is still going
 * to retry them, and flipping the resume to "failed" while a retry is pending
 * would be misleading (and races with a later success).
 */
export async function reportTerminalFailure(
  job: Job,
  error: unknown
): Promise<void> {
  if (!(await isTerminalFailure(job))) {
    return;
  }

  if (!config.convexSiteUrl || !config.workerServiceKey) return;

  const payload = resumeJobSchema.safeParse(job.data);
  if (!payload.success) {
    await job
      .log("cannot report failure: invalid job payload")
      .catch(() => undefined);
    return;
  }

  try {
    await postJson<{ success: boolean }>(
      `${config.convexSiteUrl}/worker/resume-failed`,
      {
        resumeId: payload.data.resumeId,
        interviewId: payload.data.interviewId,
        error: error instanceof Error ? error.message : String(error),
      },
      { "X-Worker-Key": config.workerServiceKey },
      10_000
    );
  } catch (reportError) {
    await job
      .log(`failed to report failure: ${String(reportError)}`)
      .catch(() => undefined);
  }
}

/**
 * Resume-processing pipeline.
 *
 * 1. The AI service extracts text, chunks, embeds (Ollama) and indexes the
 *    chunks into Qdrant via LangChain, then returns the extracted text.
 * 2. The AI service generates a resume-grounded interview plan.
 * 3. Results are persisted back to Convex through an authenticated HTTP action.
 */
export async function processResumeJob(job: Job): Promise<ResumeProcessResult> {
  const payload: ResumeJob = resumeJobSchema.parse(job.data);
  const authHeaders = { "X-API-Key": config.aiServiceApiKey };

  try {
    await job.updateProgress(10);

    const processed = await postJson<ResumeProcessResponse>(
      `${config.aiServiceUrl}/v1/resumes/process`,
      {
        resume_id: payload.resumeId,
        user_id: payload.userId,
        file_url: payload.fileUrl,
      },
      authHeaders
    );

    await job.updateProgress(40);

    // Ground the plan in the chunks most relevant to the target role. Retrieval
    // is filtered by owner and resume inside the AI service, so a job can never
    // read another user's documents. Fall back to the full text if it fails.
    let resumeContext = processed.text;
    try {
      const retrieved = await postJson<RetrieveResponse>(
        `${config.aiServiceUrl}/v1/resumes/retrieve`,
        {
          resume_id: payload.resumeId,
          user_id: payload.userId,
          query: payload.jobDescription,
          limit: 8,
        },
        authHeaders
      );
      if (retrieved.chunks.length > 0) {
        resumeContext = retrieved.chunks.map((chunk) => chunk.text).join("\n\n");
      }
    } catch (error) {
      job.log(
        `context retrieval failed; using full resume text: ${String(error)}`
      );
    }

    await job.updateProgress(70);

    const plan = await postJson<InterviewPlanResponse>(
      `${config.aiServiceUrl}/v1/interviews/plan`,
      {
        resume_text: resumeContext,
        job_description: payload.jobDescription,
      },
      authHeaders
    );

    if (plan.questions.length === 0) {
      // An empty plan would leave the lobby stuck at "ready" with no questions.
      throw new Error("AI service returned an empty interview plan");
    }

    await job.updateProgress(90);

    if (!config.convexSiteUrl || !config.workerServiceKey) {
      job.log(
        "CONVEX_SITE_URL / WORKER_SERVICE_KEY not set; skipping result persistence"
      );
    } else {
      await postJson<{ success: boolean }>(
        `${config.convexSiteUrl}/worker/resume-complete`,
        {
          resumeId: payload.resumeId,
          interviewId: payload.interviewId,
          resumeText: processed.text,
          chunkCount: processed.chunk_count,
          plan: {
            questions: plan.questions,
            focusAreas: plan.focus_areas,
          },
        },
        { "X-Worker-Key": config.workerServiceKey }
      );
    }

    await job.updateProgress(100);

    return {
      chunkCount: processed.chunk_count,
      questionCount: plan.questions.length,
    };
  } catch (error) {
    // Log every attempt, but let BullMQ decide whether it is terminal. The
    // worker's `failed` handler reports terminal failures to Convex.
    await job
      .log(
        `attempt ${job.attemptsStarted}/${job.opts.attempts ?? 1} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
      .catch(() => undefined);
    throw error;
  }
}
