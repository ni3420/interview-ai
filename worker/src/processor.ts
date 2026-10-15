import type { Job } from "bullmq";
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

async function postJson<TResponse>(
  url: string,
  body: unknown,
  headers: Record<string, string>
): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Request to ${url} failed (${response.status}): ${detail.slice(0, 200)}`
    );
  }

  return (await response.json()) as TResponse;
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

  await job.updateProgress(70);

  const plan = await postJson<InterviewPlanResponse>(
    `${config.aiServiceUrl}/v1/interviews/plan`,
    {
      resume_text: processed.text,
      job_description: payload.jobDescription,
    },
    authHeaders
  );

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
}
