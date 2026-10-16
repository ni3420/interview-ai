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
  headers: Record<string, string>
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
        new Error(`Request to ${url} timed out after ${config.aiRequestTimeoutMs}ms`)
      );
    }, config.aiRequestTimeoutMs);

    request.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on("close", () => clearTimeout(timer));

    request.write(payload);
    request.end();
  });
}

/**
 * Tells Convex a job failed so the lobby shows an actionable error instead of
 * waiting on progress that will never arrive. Best-effort: a failure here must
 * not mask the original error.
 */
async function reportFailure(job: Job, payload: ResumeJob, error: unknown): Promise<void> {
  if (!config.convexSiteUrl || !config.workerServiceKey) return;
  try {
    await postJson<{ success: boolean }>(
      `${config.convexSiteUrl}/worker/resume-failed`,
      {
        resumeId: payload.resumeId,
        interviewId: payload.interviewId,
        error: error instanceof Error ? error.message : String(error),
      },
      { "X-Worker-Key": config.workerServiceKey }
    );
  } catch (reportError) {
    job.log(`failed to report failure: ${String(reportError)}`);
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
    await reportFailure(job, payload, error);
    throw error;
  }
}
