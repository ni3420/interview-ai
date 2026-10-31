"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  ClipboardList,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Target,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildQuestionBreakdown,
  formatScore,
  reportScoreScale,
  RUBRIC_SCORE_SCALE,
  scoreBand,
  type QuestionBreakdownItem,
} from "@/lib/interview-report";

interface Interview {
  _id: string;
  userId: string;
  resumeText?: string;
  jobDescription: string;
  status: "setup" | "in_progress" | "completed" | "failed";
  plan?: { questions: string[] } | null;
  currentQuestionIndex: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface InterviewAnswer {
  _id: string;
  interviewId: string;
  questionIndex: number;
  question: string;
  answer: string;
  followUpCount: number;
  createdAt: number;
}

type QuestionStatus = "answered" | "partial" | "unanswered" | "not_evaluable";
type ExpectedAnswerSource =
  | "ai_generated"
  | "stored_reference"
  | "unavailable";
type CompletionStatus = "complete" | "partial" | "insufficient_evidence";

interface ReportCriterion {
  id: string;
  label: string;
  score: number;
  weight: number;
  evidence: string[];
  comment: string;
}

interface ReportQuestion {
  questionIndex: number;
  score: number | null;
  feedback: string;
  status?: QuestionStatus;
  question?: string;
  answer?: string;
  expectedAnswer?: string;
  expectedAnswerSource?: ExpectedAnswerSource;
  notEvaluableReason?: string;
  evidence?: string[];
  criteria?: ReportCriterion[];
  strengths?: string[];
  missingPoints?: string[];
  linkReasons?: string[];
}

interface ReportCounts {
  questions: number;
  answered: number;
  partial: number;
  unanswered: number;
  notEvaluable: number;
  evaluated: number;
  excludedSegments: number;
}

interface SkillScores {
  technicalKnowledge: number;
  problemSolving: number;
  communication: number;
  conceptualUnderstanding: number;
  relevance: number;
}

interface Report {
  _id: string;
  interviewId: string;
  userId: string;
  overallScore: number | null;
  summary?: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  questionScores: ReportQuestion[];
  version?: number;
  schemaVersion?: string;
  scoreScale?: number;
  completionStatus?: CompletionStatus;
  counts?: ReportCounts;
  skillScores?: SkillScores;
  qualityWarnings?: Array<{ code: string; message: string }>;
  createdAt: number;
}

interface ReportJob {
  _id: string;
  interviewId: string;
  userId: string;
  status: "queued" | "processing" | "completed" | "failed";
  error?: string;
  errorCode?: string;
  version?: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

const STATUS_LABELS: Record<QuestionStatus, string> = {
  answered: "Answered",
  partial: "Partially answered",
  unanswered: "No answer",
  not_evaluable: "Not evaluable",
};

const COMPLETION_COPY: Record<
  CompletionStatus,
  { label: string; description: string }
> = {
  complete: {
    label: "Complete evaluation",
    description: "Every question had enough verifiable evidence to be scored.",
  },
  partial: {
    label: "Partial evaluation",
    description:
      "Some questions had limited or unattributed evidence and were not scored.",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    description:
      "No question had enough verifiable evidence for a score. Nothing was scored as zero.",
  },
};

const EXPECTED_SOURCE_LABELS: Record<ExpectedAnswerSource, string> = {
  stored_reference: "Stored reference answer",
  ai_generated: "AI-generated reference, not used for scoring",
  unavailable: "Not available",
};

const SKILL_ROWS: Array<{ key: keyof SkillScores; label: string }> = [
  { key: "technicalKnowledge", label: "Technical knowledge" },
  { key: "problemSolving", label: "Problem solving" },
  { key: "communication", label: "Communication" },
  { key: "conceptualUnderstanding", label: "Conceptual understanding" },
  { key: "relevance", label: "Relevance" },
];

const COUNT_ROWS: Array<{ key: keyof ReportCounts; label: string }> = [
  { key: "questions", label: "Questions" },
  { key: "answered", label: "Answered" },
  { key: "partial", label: "Partial" },
  { key: "unanswered", label: "No answer" },
  { key: "notEvaluable", label: "Not evaluable" },
  { key: "evaluated", label: "Scored" },
];

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isRubricReport(report: Report): boolean {
  return (
    report.scoreScale === RUBRIC_SCORE_SCALE ||
    report.schemaVersion === "report-v1"
  );
}

function statusBadgeVariant(
  status?: QuestionStatus
): "success" | "secondary" | "outline" {
  if (status === "answered") return "success";
  if (status === "partial") return "secondary";
  return "outline";
}

function ScoreMeter({ score, max }: { score: number; max: number }) {
  const percent =
    max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0;

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function TextList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function RubricQuestionCard({
  question,
  scale,
}: {
  question: ReportQuestion;
  scale: number;
}) {
  const status = question.status;
  const displayQuestion =
    question.question?.trim() || `Question ${question.questionIndex + 1}`;
  const showAnswer =
    (!status || status === "answered" || status === "partial") &&
    Boolean(question.answer?.trim());
  const expectedSource = question.expectedAnswerSource ?? "unavailable";
  const showExpected =
    expectedSource !== "unavailable" && Boolean(question.expectedAnswer?.trim());
  const notEvaluableCopy =
    question.notEvaluableReason?.trim() ||
    (status === "unanswered"
      ? "The candidate did not provide a verifiable answer."
      : "No verifiable candidate answer was captured for this question.");

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Question {question.questionIndex + 1}
            </p>
            <CardTitle className="mt-1 text-base font-semibold leading-snug">
              {displayQuestion}
            </CardTitle>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {typeof question.score === "number"
                ? formatScore(question.score, scale)
                : "Not scored"}
            </span>
            <Badge variant={statusBadgeVariant(status)}>
              {status ? STATUS_LABELS[status] : "Scored"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Candidate answer
          </h4>
          {showAnswer ? (
            <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-3 leading-relaxed text-foreground">
              {question.answer}
            </blockquote>
          ) : (
            <p className="mt-2 leading-relaxed text-muted-foreground">
              {notEvaluableCopy}
            </p>
          )}
        </section>

        {showExpected && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Expected answer{" "}
              <span className="font-normal normal-case tracking-normal">
                ({EXPECTED_SOURCE_LABELS[expectedSource]})
              </span>
            </h4>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-foreground">
              {question.expectedAnswer}
            </p>
          </section>
        )}

        {question.feedback?.trim() && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Feedback
            </h4>
            <p className="mt-2 leading-relaxed text-foreground">
              {question.feedback}
            </p>
          </section>
        )}

        {question.strengths && question.strengths.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              What worked
            </h4>
            <TextList items={question.strengths} />
          </section>
        )}

        {question.missingPoints && question.missingPoints.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Missing or incomplete
            </h4>
            <TextList items={question.missingPoints} />
          </section>
        )}

        {question.evidence && question.evidence.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Evidence from your answer
            </h4>
            <ul className="mt-2 space-y-2">
              {question.evidence.map((quote, index) => (
                <li key={`${index}-${quote}`}>
                  <blockquote className="border-l-2 border-border pl-3 leading-relaxed text-muted-foreground">
                    &ldquo;{quote}&rdquo;
                  </blockquote>
                </li>
              ))}
            </ul>
          </section>
        )}

        {question.criteria && question.criteria.length > 0 && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Rubric breakdown
            </h4>
            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
              {question.criteria.map((criterion) => (
                <li
                  key={criterion.id}
                  className="flex items-start justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {criterion.label}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({criterion.weight}%)
                      </span>
                    </p>
                    {criterion.comment?.trim() && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {criterion.comment}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                    {formatScore(criterion.score, RUBRIC_SCORE_SCALE)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {question.linkReasons && question.linkReasons.length > 0 && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Matched to this question because: {question.linkReasons.join("; ")}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function LegacyQuestionCard({
  item,
  scale,
}: {
  item: QuestionBreakdownItem;
  scale: number;
}) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Question {item.questionIndex + 1}
            </p>
            <CardTitle className="mt-1 text-base font-semibold leading-snug">
              {item.question}
            </CardTitle>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {typeof item.score === "number"
              ? formatScore(item.score, scale)
              : "Not scored"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <section>
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Candidate answer
          </h4>
          {item.answer.trim().length > 0 ? (
            <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-3 leading-relaxed text-foreground">
              {item.answer}
            </blockquote>
          ) : (
            <p className="mt-2 text-muted-foreground">
              No verbal or written answer was recorded for this question.
            </p>
          )}
        </section>
        {item.feedback?.trim() && (
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Feedback
            </h4>
            <p className="mt-2 leading-relaxed text-foreground">
              {item.feedback}
            </p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default function InterviewReportPage() {
  const params = useParams();
  const interviewId = params.id as string;

  const interview = useQuery(api.interviews.getInterview, { interviewId }) as
    | Interview
    | null
    | undefined;
  const answers = useQuery(api.answers.getAnswers, { interviewId }) as
    | InterviewAnswer[]
    | undefined;
  const segments = useQuery(api.answers.getTranscriptSegments, {
    interviewId,
  }) as Array<{ _id: string }> | undefined;
  const existingReport = useQuery(api.reports.getReport, { interviewId }) as
    | Report
    | null
    | undefined;
  const reportJob = useQuery(api.reports.getReportJob, { interviewId }) as
    | ReportJob
    | null
    | undefined;

  const [requestError, setRequestError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const autoRequestedRef = useRef(false);

  const requestReport = useCallback(
    async (options?: { regenerate?: boolean }) => {
      setIsRequesting(true);
      setRequestError(null);

      try {
        const response = await fetch("/api/report/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            options?.regenerate
              ? { interviewId, regenerate: true }
              : { interviewId }
          ),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error ?? `Report request failed (${response.status})`
          );
        }
      } catch (err) {
        setRequestError(
          err instanceof Error ? err.message : "Failed to start report generation"
        );
      } finally {
        setIsRequesting(false);
      }
    },
    [interviewId]
  );

  const retry = useCallback(() => {
    autoRequestedRef.current = true;
    void requestReport();
  }, [requestReport]);

  const regenerate = useCallback(() => {
    autoRequestedRef.current = true;
    void requestReport({ regenerate: true });
  }, [requestReport]);

  // Start generation once, after the Convex queries have resolved. Failed jobs
  // deliberately wait for the user to press Retry instead of retrying in a loop.
  useEffect(() => {
    if (
      !interview ||
      answers === undefined ||
      segments === undefined ||
      existingReport === undefined ||
      reportJob === undefined
    ) {
      return;
    }
    if (existingReport || reportJob) return;
    if (answers.length === 0 && segments.length === 0) return;
    if (autoRequestedRef.current) return;

    autoRequestedRef.current = true;
    void requestReport();
  }, [
    interview,
    answers,
    segments,
    existingReport,
    reportJob,
    requestReport,
  ]);

  // If the process died between the Convex mutation and Redis, the job stays
  // queued without a worker. Re-submitting is safe: Convex only asks for a new
  // enqueue once the job is stale, and BullMQ deduplicates on the stable job id.
  useEffect(() => {
    if (reportJob?.status !== "queued") return;

    const timer = setInterval(() => {
      void requestReport();
    }, 60_000);

    return () => clearInterval(timer);
  }, [reportJob?.status, requestReport]);

  if (interview === null) {
    return (
      <div className="container max-w-xl px-4 py-20 text-center">
        <h1 className="text-xl font-bold text-foreground">Interview Not Found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This interview does not exist or you do not have permission to view it.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  if (
    !interview ||
    answers === undefined ||
    segments === undefined ||
    existingReport === undefined ||
    reportJob === undefined
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-xs font-medium text-muted-foreground">
            Loading interview details...
          </p>
        </div>
      </div>
    );
  }

  const report = existingReport;
  const jobGenerating =
    reportJob?.status === "queued" || reportJob?.status === "processing";
  const awaitingReport = reportJob?.status === "completed" && !report;
  const isGenerating = isRequesting || jobGenerating || awaitingReport;
  const error =
    reportJob?.status === "failed"
      ? reportJob.error ?? "Report generation failed"
      : requestError;

  if (!report) {
    if (isGenerating) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
          </div>
          <div className="max-w-xs text-center">
            <h1 className="text-lg font-bold text-foreground">
              Analyzing Performance
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Evaluating your responses against the target job description...
            </p>
            <p className="mt-3 text-[11px] text-muted-foreground">
              This runs in the background and can take several minutes with local
              models. You can leave this page and come back.
            </p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="container max-w-xl px-4 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-foreground">
            Failed to Generate Report
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">{error}</p>
          <Button onClick={retry} className="mt-6 gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry Generation
          </Button>
        </div>
      );
    }

    if (answers.length === 0 && segments.length === 0) {
      return (
        <div className="container max-w-xl px-4 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ClipboardList className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-foreground">No report yet</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            This interview has no recorded answers or transcript that can be
            evaluated.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  const rubric = isRubricReport(report);
  const scale = rubric ? RUBRIC_SCORE_SCALE : reportScoreScale(report);
  const questions = [...report.questionScores].sort(
    (a, b) => a.questionIndex - b.questionIndex
  );
  const planQuestions = interview.plan?.questions ?? [];
  const answeredCount = answers.length;
  const totalQuestions = Math.max(planQuestions.length, answeredCount);
  const breakdown = buildQuestionBreakdown(
    answers,
    report.questionScores,
    planQuestions
  );
  const completion = report.completionStatus
    ? COMPLETION_COPY[report.completionStatus]
    : null;
  const counts = report.counts;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={regenerate}
            disabled={isRequesting || jobGenerating}
            className="gap-2"
          >
            {isRequesting || jobGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {isRequesting || jobGenerating ? "Generating" : "Regenerate report"}
          </Button>
        </div>
      </header>

      <main className="flex-1 py-6 sm:py-10">
        <div className="mx-auto max-w-4xl space-y-4 px-4 pb-4 sm:space-y-6 sm:px-6">
          {(isRequesting || jobGenerating) && (
            <div
              className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground"
              role="status"
            >
              Generating a new report version. This report stays available until
              the new one is ready.
            </div>
          )}

          {error && (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
              role="alert"
            >
              <p className="font-medium text-foreground">
                A newer report could not be generated.
              </p>
              <p className="mt-1 text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={regenerate}
                disabled={isRequesting || jobGenerating}
                className="mt-3 gap-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          )}

          <Card className="border-border">
            <CardHeader className="pb-2 text-center">
              <CardTitle className="text-xl font-bold sm:text-2xl">
                Performance Report
              </CardTitle>
              <CardDescription>
                {formatDate(interview.createdAt)}
                {report.version && report.version > 1
                  ? ` • Revision ${report.version}`
                  : ""}
                {rubric
                  ? ""
                  : ` • ${answeredCount}/${totalQuestions} questions recorded`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-2 py-2">
                <p className="text-4xl font-extrabold tabular-nums text-foreground">
                  {formatScore(report.overallScore, scale)}
                </p>
                {typeof report.overallScore === "number" ? (
                  <p className="text-sm font-medium text-foreground">
                    {scoreBand(report.overallScore, scale)} overall performance
                  </p>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">
                    No question had enough evidence to score.
                  </p>
                )}
                {completion && (
                  <Badge variant="outline">{completion.label}</Badge>
                )}
                {completion && (
                  <p className="max-w-xl text-center text-xs leading-relaxed text-muted-foreground">
                    {completion.description}
                  </p>
                )}
                {report.summary?.trim() && (
                  <p className="mt-2 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
                    {report.summary}
                  </p>
                )}
              </div>

              {counts && (
                <div className="mt-4 border-t border-border pt-4">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {COUNT_ROWS.map((row) => (
                      <div key={row.key}>
                        <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          {row.label}
                        </dt>
                        <dd className="text-lg font-semibold tabular-nums text-foreground">
                          {counts[row.key]}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {counts.excludedSegments > 0 && (
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                      {counts.excludedSegments} background or unattributed
                      transcript segment
                      {counts.excludedSegments === 1 ? " was" : "s were"}{" "}
                      excluded from scoring.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {report.skillScores && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Target className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Skill assessment
                </CardTitle>
                <CardDescription>
                  Averaged across the questions that had evaluable evidence.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {SKILL_ROWS.map((row) => {
                  const value = report.skillScores?.[row.key] ?? 0;
                  return (
                    <div key={row.key}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-foreground">
                          {row.label}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatScore(value, RUBRIC_SCORE_SCALE)}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <ScoreMeter score={value} max={RUBRIC_SCORE_SCALE} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
                Key strengths
              </CardTitle>
              <CardDescription>
                What the evidence shows you explained well.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.strengths.length > 0 ? (
                <TextList items={report.strengths} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No strengths were recorded for this report.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Lightbulb className="h-4 w-4 shrink-0" aria-hidden="true" />
                Development plan
              </CardTitle>
              <CardDescription>
                Recommended next steps that address the weaknesses above.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Areas to improve
                </h3>
                {report.weaknesses.length > 0 ? (
                  <TextList items={report.weaknesses} />
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No weaknesses were recorded for this report.
                  </p>
                )}
              </section>
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recommended next steps
                </h3>
                {report.recommendations.length > 0 ? (
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-foreground">
                    {report.recommendations.map((item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No recommendations were recorded for this report.
                  </p>
                )}
              </section>
            </CardContent>
          </Card>

          {report.qualityWarnings && report.qualityWarnings.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Evidence notes
                </CardTitle>
                <CardDescription>
                  These notes describe limits in the captured audio or transcript,
                  not your ability.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
                  {report.qualityWarnings.map((warning, index) => (
                    <li key={`${index}-${warning.code}`}>{warning.message}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <section aria-labelledby="question-review-heading" className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id="question-review-heading"
                className="text-lg font-bold text-foreground"
              >
                Question review
              </h2>
              {rubric && counts && (
                <span className="text-xs text-muted-foreground">
                  {counts.evaluated} of {counts.questions} scored
                </span>
              )}
            </div>

            {rubric ? (
              questions.length > 0 ? (
                questions.map((question) => (
                  <RubricQuestionCard
                    key={question.questionIndex}
                    question={question}
                    scale={RUBRIC_SCORE_SCALE}
                  />
                ))
              ) : (
                <Card className="border-border">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No interview questions were detected in the transcript.
                  </CardContent>
                </Card>
              )
            ) : breakdown.length > 0 ? (
              breakdown.map((item) => (
                <LegacyQuestionCard
                  key={item.questionIndex}
                  item={item}
                  scale={scale}
                />
              ))
            ) : (
              <Card className="border-border">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No questions or answers were recorded for this interview.
                </CardContent>
              </Card>
            )}
          </section>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Button asChild variant="outline" className="h-11 flex-1">
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Dashboard
              </Link>
            </Button>
            <Button asChild className="h-11 flex-1">
              <Link href={`/interview/${interviewId}/review`}>
                Review all answers
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
