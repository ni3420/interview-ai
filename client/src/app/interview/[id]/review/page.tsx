"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, ArrowUpRight, Loader2 } from "lucide-react";
import { Badge, type BadgeStatus } from "@/features/components/common/Badge";
import {
  buildQuestionBreakdown,
  formatScore,
  reportScoreScale,
  RUBRIC_SCORE_SCALE,
  scoreBand,
} from "@/lib/interview-report";

interface Interview {
  _id: string;
  jobDescription: string;
  status: "setup" | "in_progress" | "completed" | "failed";
  plan?: { questions?: string[]; focus_areas?: string[] } | null;
}

interface Answer {
  _id: string;
  questionIndex: number;
  question: string;
  answer: string;
  followUpCount: number;
  createdAt: number;
}

interface Report {
  overallScore: number | null;
  scoreScale?: number;
  strengths?: string[];
  weaknesses?: string[];
  questionScores: Array<{
    questionIndex: number;
    score: number | null;
    feedback: string;
    status?: "answered" | "partial" | "unanswered" | "not_evaluable";
    notEvaluableReason?: string;
  }>;
}

const statusBadge: Record<Interview["status"], BadgeStatus> = {
  setup: "neutral",
  in_progress: "info",
  completed: "success",
  failed: "warning",
};

export default function InterviewReviewPage() {
  const params = useParams();
  const interviewId = params.id as string;

  const interview = useQuery(api.interviews.getInterview, { interviewId }) as
    | Interview
    | null
    | undefined;
  const answers = useQuery(api.answers.getAnswers, { interviewId }) as
    | Answer[]
    | undefined;
  const report = useQuery(api.reports.getReport, { interviewId }) as
    | Report
    | null
    | undefined;

  // Actual questions asked in the interview, each paired with the candidate's
  // complete answer. Consecutive answers that share a question are merged so a
  // split answer is never shown as duplicate questions or partial responses.
  const breakdown = useMemo(
    () =>
      buildQuestionBreakdown(
        answers ?? [],
        report?.questionScores ?? [],
        interview?.plan?.questions ?? []
      ),
    [answers, report, interview]
  );

  if (interview === undefined || answers === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            className="h-5 w-5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Loading review
          </p>
        </div>
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Not found
        </p>
        <h1 className="font-display text-3xl leading-tight tracking-tight text-foreground">
          Session not found
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This interview does not exist or you do not have permission to view
          it.
        </p>
        <Link
          href="/dashboard"
          className="mt-2 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const answeredCount = breakdown.length;
  const reportScale = reportScoreScale(report);
  const reportQuestionByIndex = new Map(
    (report?.questionScores ?? []).map((question) => [
      question.questionIndex,
      question,
    ])
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/dashboard"
        className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft
          className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
          aria-hidden="true"
        />
        Back to dashboard
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Session review
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            Interview review
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge status={statusBadge[interview.status]} dot>
              {interview.status.replace("_", " ")}
            </Badge>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {answeredCount} {answeredCount === 1 ? "answer" : "answers"}
            </span>
          </div>
        </div>

        {report && (
          <Link
            href={`/interview/${interviewId}/report`}
            className="group inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-foreground/30"
          >
            Full report
            <span className="font-mono text-xs text-muted-foreground">
              {formatScore(report.overallScore, reportScale)}
            </span>
            <ArrowUpRight
              className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        )}
      </header>

      {report && (
        <section className="grid gap-8 border-b border-border py-8 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Overall
            </p>
            <p className="mt-2 font-display text-6xl leading-none tracking-tight text-foreground">
              {formatScore(report.overallScore, reportScale)}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {typeof report.overallScore === "number"
                ? `${scoreBand(report.overallScore, reportScale)} overall performance`
                : "No question had enough evidence to score."}
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Strengths
              </h2>
              {(report.strengths ?? []).length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground">
                  {(report.strengths ?? []).map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        className="mt-2 h-px w-3 shrink-0 bg-success"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  No strengths recorded.
                </p>
              )}
            </div>
            <div>
              <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                To improve
              </h2>
              {(report.weaknesses ?? []).length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground">
                  {(report.weaknesses ?? []).map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        className="mt-2 h-px w-3 shrink-0 bg-warning"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  No weaknesses recorded.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-border py-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Target role
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {interview.jobDescription}
        </p>
      </section>

      <section className="py-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl leading-none tracking-tight text-foreground">
            Questions and answers
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {answeredCount} total
          </span>
        </div>

        {breakdown.length === 0 ? (
          <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
            No questions or responses were recorded for this session.
          </p>
        ) : (
          <ol className="mt-6 divide-y divide-border border-t border-border">
            {breakdown.map((item, index) => {
              const score =
                typeof item.score === "number"
                  ? { score: item.score, feedback: item.feedback ?? "" }
                  : undefined;
              const reportQuestion = reportQuestionByIndex.get(
                item.questionIndex
              );
              const answerVisible =
                !reportQuestion?.status ||
                reportQuestion.status === "answered" ||
                reportQuestion.status === "partial";
              const percent = score
                ? reportScale === RUBRIC_SCORE_SCALE
                  ? score.score * 10
                  : score.score
                : 0;

              return (
                <li key={item.questionIndex} className="py-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-4">
                      <span className="mt-0.5 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Q{String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="font-display text-lg leading-snug text-foreground">
                        {item.question}
                      </p>
                    </div>
                    {score && (
                      <Badge
                        status={
                          percent >= 80
                            ? "success"
                            : percent >= 60
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {formatScore(score.score, reportScale)}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 ml-0 border-l-2 border-border pl-4 sm:ml-10">
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Your answer
                    </p>
                    {answerVisible && item.answer.trim().length > 0 ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                        {item.answer}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs italic text-muted-foreground">
                        {reportQuestion?.notEvaluableReason ??
                          "No verifiable answer was recorded for this question."}
                      </p>
                    )}
                  </div>

                  {score?.feedback && (
                    <div className="mt-4 ml-0 border-l-2 border-signal pl-4 sm:ml-10">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
                        Feedback
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                        {score.feedback}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
