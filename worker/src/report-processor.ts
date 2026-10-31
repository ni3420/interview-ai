import { UnrecoverableError, type Job } from "bullmq";
import { z } from "zod";
import { config } from "./config";
import { HttpError, postJson } from "./http";
import { reportJobSchema } from "./job";
import { logEvent, logStage, queueWaitMs } from "./log";
import { isTerminalFailure } from "./processor";

const STATUSES = [
  "answered",
  "partial",
  "unanswered",
  "not_evaluable",
] as const;
const EXPECTED_SOURCES = [
  "ai_generated",
  "stored_reference",
  "unavailable",
] as const;
const COMPLETION_STATUSES = [
  "complete",
  "partial",
  "insufficient_evidence",
] as const;
const CRITERION_IDS = [
  "technical_correctness",
  "relevance",
  "conceptual_understanding",
  "completeness",
  "problem_solving",
  "communication",
] as const;

const segmentSchema = z.object({
  id: z.string(),
  speaker: z.enum(["interviewer", "candidate", "unknown"]),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  asrConfidence: z.number().min(0).max(1).nullish(),
  speakerConfidence: z.number().min(0).max(1),
});

const reportContextSchema = z.object({
  interviewId: z.string(),
  userId: z.string(),
  resumeText: z.string(),
  jobDescription: z.string(),
  version: z.number().int().min(1).optional(),
  attempt: z.number().int().min(1).optional(),
  qaPairs: z.array(
    z.object({
      questionIndex: z.number().int().min(0),
      question: z.string(),
      answer: z.string(),
    })
  ),
  segments: z.array(segmentSchema).default([]),
});

type ReportContext = z.infer<typeof reportContextSchema>;

const criterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  score: z.number().min(0).max(10),
  weight: z.number().min(0).max(100),
  evidence: z.array(z.string()),
  comment: z.string(),
});

const questionSchema = z.object({
  question_index: z.number().int().min(0),
  question: z.string(),
  answer: z.string(),
  status: z.enum(STATUSES),
  score: z.number().min(0).max(10).nullable(),
  feedback: z.string(),
  expected_answer: z.string().nullable(),
  expected_answer_source: z.enum(EXPECTED_SOURCES),
  not_evaluable_reason: z.string().nullable(),
  evidence: z.array(z.string()),
  criteria: z.array(criterionSchema),
  strengths: z.array(z.string()),
  missing_points: z.array(z.string()),
  link_reasons: z.array(z.string()).default([]),
});

const reportSchema = z.object({
  overall_score: z.number().min(0).max(10).nullable(),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  question_scores: z.array(questionSchema),
  skill_scores: z
    .object({
      technical_knowledge: z.number().min(0).max(10),
      problem_solving: z.number().min(0).max(10),
      communication: z.number().min(0).max(10),
      conceptual_understanding: z.number().min(0).max(10),
      relevance: z.number().min(0).max(10),
    })
    .nullable(),
  counts: z.object({
    questions: z.number().int().min(0),
    answered: z.number().int().min(0),
    partial: z.number().int().min(0),
    unanswered: z.number().int().min(0),
    not_evaluable: z.number().int().min(0),
    evaluated: z.number().int().min(0),
    excluded_segments: z.number().int().min(0),
  }),
  completion_status: z.enum(COMPLETION_STATUSES),
  quality_warnings: z.array(
    z.object({ code: z.string(), message: z.string() })
  ),
  prompt_version: z.string(),
  rubric_version: z.string(),
  score_scale: z.literal(10),
});

export type ReportEvaluation = z.infer<typeof reportSchema>;

export interface ReportProcessResult {
  overallScore: number | null;
  questionCount: number;
  evaluatedCount: number;
  version: number;
}

/** A failure with a stable code that the report UI can translate. */
export class ReportJobError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const REPORT_ERROR_MESSAGES: Record<string, string> = {
  invalid_model_output:
    "The evaluation model returned output that did not match the rubric or transcript.",
  ai_service_unavailable:
    "The evaluation service is temporarily unavailable. Please retry.",
  invalid_request: "The report request was rejected by the evaluation service.",
  no_answers: "No answers or transcript segments are available to evaluate.",
  stale_report_job: "A newer report version has already been requested.",
  report_generation_failed: "Report generation failed. Please retry.",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function closeEnough(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 0.011;
}

/**
 * Re-validates the AI response before anything is written to Convex.
 *
 * The AI service already checked this, but the worker is the last boundary
 * before persistence: a stale or buggy deployment must not be able to store an
 * evidence quote that is not in the transcript, or a score that does not follow
 * from the rubric.
 */
export function validateReport(report: ReportEvaluation): void {
  if (report.score_scale !== 10) {
    throw new ReportJobError("invalid_model_output", "Unexpected score scale");
  }

  const indexes = report.question_scores.map((question) => question.question_index);
  if (new Set(indexes).size !== indexes.length) {
    throw new ReportJobError(
      "invalid_model_output",
      "Duplicate question indices"
    );
  }

  const scored = report.question_scores.filter(
    (question) => question.score !== null
  );

  for (const question of report.question_scores) {
    const evaluatedStatus =
      question.status === "answered" || question.status === "partial";
    if (evaluatedStatus !== (question.score !== null)) {
      throw new ReportJobError(
        "invalid_model_output",
        `Question ${question.question_index} has an inconsistent score/status`
      );
    }
    if (!evaluatedStatus) continue;

    const criterionIds = question.criteria.map((criterion) => criterion.id);
    if (
      criterionIds.length !== CRITERION_IDS.length ||
      new Set(criterionIds).size !== criterionIds.length ||
      !CRITERION_IDS.every((id) => criterionIds.includes(id))
    ) {
      throw new ReportJobError(
        "invalid_model_output",
        `Question ${question.question_index} does not use the rubric`
      );
    }

    const answer = normalizeWhitespace(question.answer);
    for (const criterion of question.criteria) {
      for (const quote of criterion.evidence) {
        if (normalizeWhitespace(quote) && !answer.includes(normalizeWhitespace(quote))) {
          throw new ReportJobError(
            "invalid_model_output",
            `Question ${question.question_index} has evidence that is not in the answer`
          );
        }
      }
    }

    const recomputed = question.criteria.reduce(
      (total, criterion) => total + (criterion.score * criterion.weight) / 100,
      0
    );
    if (!closeEnough(recomputed, question.score ?? 0)) {
      throw new ReportJobError(
        "invalid_model_output",
        `Question ${question.question_index} score does not match its criteria`
      );
    }
  }

  if (scored.length === 0) {
    if (report.overall_score !== null) {
      throw new ReportJobError(
        "invalid_model_output",
        "Overall score exists without evaluated questions"
      );
    }
  } else {
    if (report.overall_score === null) {
      throw new ReportJobError(
        "invalid_model_output",
        "Overall score is missing"
      );
    }
    const expected = mean(
      scored.map((question) => question.score as number)
    );
    if (!closeEnough(report.overall_score, expected)) {
      throw new ReportJobError(
        "invalid_model_output",
        "Overall score does not match question scores"
      );
    }
  }

  const counts = report.counts;
  const byStatus = (status: string) =>
    report.question_scores.filter((question) => question.status === status).length;
  if (
    counts.questions !== report.question_scores.length ||
    counts.answered !== byStatus("answered") ||
    counts.partial !== byStatus("partial") ||
    counts.unanswered !== byStatus("unanswered") ||
    counts.not_evaluable !== byStatus("not_evaluable") ||
    counts.evaluated !== scored.length
  ) {
    throw new ReportJobError(
      "invalid_model_output",
      "Report counts do not match question statuses"
    );
  }
}

function parseAiErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { detail?: { code?: unknown } };
    return typeof parsed.detail?.code === "string" ? parsed.detail.code : null;
  } catch {
    return null;
  }
}

async function requestEvaluation(
  context: ReportContext
): Promise<ReportEvaluation> {
  let raw: unknown;
  try {
    raw = await postJson<unknown>(
      `${config.aiServiceUrl}/v1/interviews/report`,
      {
        interview_id: context.interviewId,
        resume_text: context.resumeText,
        job_description: context.jobDescription,
        qa_pairs: context.qaPairs.map((pair) => ({
          question_index: pair.questionIndex,
          question: pair.question,
          answer: pair.answer,
        })),
        segments: context.segments.map((segment) => ({
          id: segment.id,
          speaker: segment.speaker,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          asr_confidence: segment.asrConfidence ?? undefined,
          speaker_confidence: segment.speakerConfidence,
        })),
      },
      { "X-API-Key": config.aiServiceApiKey },
      config.reportAiRequestTimeoutMs
    );
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 502) {
        const code = parseAiErrorCode(error.body) ?? "invalid_model_output";
        throw new ReportJobError(code, REPORT_ERROR_MESSAGES[code] ?? "Report evaluation failed");
      }
      if (error.status >= 400 && error.status < 500) {
        throw new UnrecoverableError(
          REPORT_ERROR_MESSAGES.invalid_request
        );
      }
    }
    throw new ReportJobError(
      "ai_service_unavailable",
      REPORT_ERROR_MESSAGES.ai_service_unavailable ?? "Report evaluation failed"
    );
  }

  try {
    return reportSchema.parse(raw);
  } catch (error) {
    throw new ReportJobError(
      "invalid_model_output",
      `AI response did not match the report schema: ${String(error)}`
    );
  }
}

interface PersistedQuestion {
  questionIndex: number;
  score: number | null;
  feedback: string;
  status: (typeof STATUSES)[number];
  question: string;
  answer: string;
  expectedAnswer?: string;
  expectedAnswerSource: (typeof EXPECTED_SOURCES)[number];
  notEvaluableReason?: string;
  evidence: string[];
  criteria: Array<{
    id: string;
    label: string;
    score: number;
    weight: number;
    evidence: string[];
    comment: string;
  }>;
  strengths: string[];
  missingPoints: string[];
  linkReasons?: string[];
}

function toPersistedReport(report: ReportEvaluation, version: number) {
  const questionScores: PersistedQuestion[] = report.question_scores.map(
    (question) => ({
      questionIndex: question.question_index,
      score: question.score,
      feedback: question.feedback,
      status: question.status,
      question: question.question,
      answer: question.answer,
      ...(question.expected_answer
        ? { expectedAnswer: question.expected_answer }
        : {}),
      expectedAnswerSource: question.expected_answer_source,
      ...(question.not_evaluable_reason
        ? { notEvaluableReason: question.not_evaluable_reason }
        : {}),
      evidence: question.evidence,
      criteria: question.criteria,
      strengths: question.strengths,
      missingPoints: question.missing_points,
      ...(question.link_reasons.length > 0
        ? { linkReasons: question.link_reasons }
        : {}),
    })
  );

  return {
    overallScore: report.overall_score,
    summary: report.summary,
    completionStatus: report.completion_status,
    counts: {
      questions: report.counts.questions,
      answered: report.counts.answered,
      partial: report.counts.partial,
      unanswered: report.counts.unanswered,
      notEvaluable: report.counts.not_evaluable,
      evaluated: report.counts.evaluated,
      excludedSegments: report.counts.excluded_segments,
    },
    skillScores: report.skill_scores
      ? {
          technicalKnowledge: report.skill_scores.technical_knowledge,
          problemSolving: report.skill_scores.problem_solving,
          communication: report.skill_scores.communication,
          conceptualUnderstanding:
            report.skill_scores.conceptual_understanding,
          relevance: report.skill_scores.relevance,
        }
      : undefined,
    qualityWarnings: report.quality_warnings,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    recommendations: report.recommendations,
    questionScores,
    version,
    promptVersion: report.prompt_version,
    rubricVersion: report.rubric_version,
  };
}

/**
 * Asynchronous report-generation pipeline.
 *
 * 1. Mark the Convex job as processing (with its version).
 * 2. Fetch the interview, saved answers and raw transcript segments.
 * 3. Ask the AI service for a rubric evaluation built from verified evidence.
 * 4. Re-validate evidence, scores and counts, then persist the versioned report.
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
  const jobId = job.id;
  const attempt = Math.max(job.attemptsStarted, 1);

  logEvent("info", "report job started", {
    jobId,
    queue: config.reportQueueName,
    version: payload.version ?? 1,
    attempt,
    queueWaitMs: queueWaitMs(job),
    reportEnqueuedAt: job.timestamp,
    reportStartedAt: job.processedOn ?? job.timestamp,
  });

  try {
    await job.updateProgress(5);

    let startedAt = performance.now();
    await postJson<{ success: boolean }>(
      `${config.convexSiteUrl}/worker/report-start`,
      {
        interviewId: payload.interviewId,
        version: payload.version,
        attempt,
      },
      workerHeaders,
      15_000
    );
    logStage("worker.report.start", startedAt, { jobId });

    startedAt = performance.now();
    const rawContext = await postJson<unknown>(
      `${config.convexSiteUrl}/worker/report-context`,
      { interviewId: payload.interviewId },
      workerHeaders,
      15_000
    );
    logStage("worker.report.context", startedAt, { jobId });
    const context: ReportContext = reportContextSchema.parse(rawContext);
    const version = payload.version ?? context.version ?? 1;

    if (context.qaPairs.length === 0 && context.segments.length === 0) {
      // Waiting will not create evidence; fail immediately rather than retrying.
      throw new UnrecoverableError(REPORT_ERROR_MESSAGES.no_answers);
    }

    await job.updateProgress(20);

    startedAt = performance.now();
    const report = await requestEvaluation(context);
    logStage("worker.report.evaluate", startedAt, {
      jobId,
      answerCount: context.qaPairs.length,
      segmentCount: context.segments.length,
      promptVersion: report.prompt_version,
    });

    validateReport(report);

    await job.updateProgress(85);

    startedAt = performance.now();
    const persisted = await postJson<{ success: boolean; stale?: boolean }>(
      `${config.convexSiteUrl}/worker/report-complete`,
      {
        interviewId: payload.interviewId,
        ...toPersistedReport(report, version),
        attempt,
      },
      workerHeaders,
      30_000
    );
    logStage("worker.report.persist", startedAt, { jobId });

    if (persisted.stale) {
      throw new UnrecoverableError(REPORT_ERROR_MESSAGES.stale_report_job);
    }

    await job.updateProgress(100);

    return {
      overallScore: report.overall_score,
      questionCount: report.question_scores.length,
      evaluatedCount: report.counts.evaluated,
      version,
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

  const errorCode =
    error instanceof ReportJobError
      ? error.code
      : error instanceof UnrecoverableError &&
          error.message === REPORT_ERROR_MESSAGES.no_answers
        ? "no_answers"
        : "report_generation_failed";

  try {
    await postJson<{ success: boolean }>(
      `${config.convexSiteUrl}/worker/report-failed`,
      {
        interviewId: payload.data.interviewId,
        version: payload.data.version,
        errorCode,
        error: REPORT_ERROR_MESSAGES[errorCode] ?? "Report generation failed.",
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
