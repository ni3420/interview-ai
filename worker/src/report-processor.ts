import { UnrecoverableError, type Job } from "bullmq";
import { z } from "zod";
import { config } from "./config";
import { postJson } from "./http";
import { reportJobSchema } from "./job";
import { isTerminalFailure } from "./processor";

export interface ReportProcessResult {
  overallScore: number;
  questionCount: number;
  scoredCount: number;
}

const reportContextSchema = z.object({
  interviewId: z.string(),
  userId: z.string(),
  resumeText: z.string(),
  jobDescription: z.string(),
  qaPairs: z.array(
    z.object({
      questionIndex: z.number().int().min(0),
      question: z.string(),
      answer: z.string(),
    })
  ),
});

type ReportContext = z.infer<typeof reportContextSchema>;

const evaluationSchema = z.object({
  overall_score: z.number().min(0).max(100),
  strengths: z.array(z.string()).min(1).max(10),
  weaknesses: z.array(z.string()).min(1).max(10),
  recommendations: z.array(z.string()).min(1).max(10),
  question_scores: z.array(
    z.object({
      question_index: z.number().int().min(0),
      score: z.number().min(0).max(100),
      feedback: z.string(),
    })
  ),
});

export type Evaluation = z.infer<typeof evaluationSchema>;

export interface AlignedQuestionScore {
  questionIndex: number;
  score: number;
  feedback: string;
}

/**
 * Maps the model's zero-based positions back to the real answer indices.
 *
 * `questionIndex` can skip numbers (for example when a question was not
 * answered), so using the model index directly would attach feedback to the
 * wrong question. Out-of-range and duplicate positions are dropped.
 */
export function alignQuestionScores(
  answers: Array<{ questionIndex: number }>,
  scores: Evaluation["question_scores"]
): AlignedQuestionScore[] {
  const aligned: AlignedQuestionScore[] = [];
  const seen = new Set<number>();

  for (const score of scores) {
    const position = score.question_index;
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position >= answers.length
    ) {
      continue;
    }

    const answer = answers[position];
    if (!answer) continue;

    const questionIndex = answer.questionIndex;
    if (seen.has(questionIndex)) continue;

    seen.add(questionIndex);
    aligned.push({
      questionIndex,
      score: score.score,
      feedback: score.feedback,
    });
  }

  return aligned.sort((a, b) => a.questionIndex - b.questionIndex);
}

/**
 * Asynchronous report-generation pipeline.
 *
 * 1. Mark the Convex job as processing.
 * 2. Fetch the interview's resume text, job description and answers.
 * 3. Evaluate them with the AI service (Gemini primary, Ollama fallback).
 * 4. Persist the report and mark the job completed.
 *
 * Only terminal failures are written back to Convex by the worker's `failed`
 * handler, matching the resume pipeline's retry semantics.
 */
export async function processReportJob(job: Job): Promise<ReportProcessResult> {
  const parsedPayload = reportJobSchema.safeParse(job.data);
  if (!parsedPayload.success) {
    throw new UnrecoverableError("Invalid report job payload");
  }
  if (!config.convexSiteUrl || !config.workerServiceKey) {
    throw new UnrecoverableError("Convex worker configuration is missing");
  }

  const payload = parsedPayload.data;
  const workerHeaders = { "X-Worker-Key": config.workerServiceKey };

  try {
    await job.updateProgress(5);

    await postJson<{ success: boolean }>(
      `${config.convexSiteUrl}/worker/report-start`,
      { interviewId: payload.interviewId },
      workerHeaders,
      15_000
    );

    const rawContext = await postJson<unknown>(
      `${config.convexSiteUrl}/worker/report-context`,
      { interviewId: payload.interviewId },
      workerHeaders,
      15_000
    );
    const context: ReportContext = reportContextSchema.parse(rawContext);

    if (context.qaPairs.length === 0) {
      // Waiting will not create answers; fail immediately rather than retrying.
      throw new UnrecoverableError("No answers to evaluate");
    }

    await job.updateProgress(20);

    const rawEvaluation = await postJson<unknown>(
      `${config.aiServiceUrl}/v1/interviews/evaluate`,
      {
        resume_text: context.resumeText,
        job_description: context.jobDescription,
        qa_pairs: context.qaPairs.map(({ question, answer }) => ({
          question,
          answer,
        })),
      },
      { "X-API-Key": config.aiServiceApiKey },
      config.reportAiRequestTimeoutMs
    );
    const evaluation: Evaluation = evaluationSchema.parse(rawEvaluation);

    await job.updateProgress(85);

    const questionScores = alignQuestionScores(
      context.qaPairs,
      evaluation.question_scores
    );

    await postJson<{ success: boolean }>(
      `${config.convexSiteUrl}/worker/report-complete`,
      {
        interviewId: payload.interviewId,
        overallScore: evaluation.overall_score,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        recommendations: evaluation.recommendations,
        questionScores,
      },
      workerHeaders,
      30_000
    );

    await job.updateProgress(100);

    return {
      overallScore: evaluation.overall_score,
      questionCount: context.qaPairs.length,
      scoredCount: questionScores.length,
    };
  } catch (error) {
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

/** Records a terminal report failure so the report page can offer a retry. */
export async function reportEvaluationTerminalFailure(
  job: Job,
  error: unknown
): Promise<void> {
  if (!(await isTerminalFailure(job))) {
    return;
  }
  if (!config.convexSiteUrl || !config.workerServiceKey) return;

  const payload = reportJobSchema.safeParse(job.data);
  if (!payload.success) {
    await job
      .log("cannot report failure: invalid report job payload")
      .catch(() => undefined);
    return;
  }

  try {
    await postJson<{ success: boolean }>(
      `${config.convexSiteUrl}/worker/report-failed`,
      {
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
