"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/features/components/common/Card";
import { Badge, type BadgeStatus } from "@/features/components/common/Badge";
import { Button } from "@/features/components/common/Button";
import { buildQuestionBreakdown } from "@/lib/interview-report";

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
  overallScore: number;
  questionScores: Array<{
    questionIndex: number;
    score: number;
    feedback: string;
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
      <div className="flex h-[60vh] items-center justify-center bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs font-medium text-slate-400">Loading interview review...</p>
        </div>
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center px-4">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
          Interview Not Found
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          This interview session does not exist or you do not have permission to view it.
        </p>
        <Button asChild className="rounded-xl">
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const answeredCount = breakdown.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:py-8">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-5 dark:border-slate-800/80">
        <div>
          <Link
            href="/dashboard"
            className="group mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Interview Session Review
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge status={statusBadge[interview.status]} dot>
              {interview.status.replace("_", " ")}
            </Badge>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {answeredCount} {answeredCount === 1 ? "Question" : "Questions"} Answered
            </span>
          </div>
        </div>

        {report && (
          <Button asChild leftIcon={<BarChart3 className="h-4 w-4" />} className="rounded-xl">
            <Link href={`/interview/${interviewId}/report`}>
              View Full Report ({report.overallScore}/100)
            </Link>
          </Button>
        )}
      </div>

      {/* Target Role Card */}
      <Card className="border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
        <CardContent className="p-4 sm:p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Target Job Description
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300 sm:text-sm">
            {interview.jobDescription}
          </p>
        </CardContent>
      </Card>

      {/* Questions & Answers */}
      {breakdown.length === 0 ? (
        <Card className="border-slate-200/80 bg-white/80 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <MessageSquare className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              No questions or responses recorded for this interview session.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {breakdown.map((item, index) => {
            const score =
              item.score !== undefined
                ? { score: item.score, feedback: item.feedback ?? "" }
                : undefined;

            return (
              <Card
                key={item.questionIndex}
                className="overflow-hidden border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/90"
              >
                <CardContent className="space-y-4 p-5 sm:p-6">
                  {/* Question Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary dark:bg-primary/20">
                        {index + 1}
                      </span>
                      <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100 sm:text-base">
                        {item.question}
                      </p>
                    </div>
                    {score && (
                      <Badge
                        status={
                          score.score >= 80
                            ? "success"
                            : score.score >= 60
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {score.score}/100
                      </Badge>
                    )}
                  </div>

                  {/* Candidate Answer Section */}
                  <div className="rounded-xl border border-slate-200/60 bg-slate-50/70 p-4 dark:border-slate-800/60 dark:bg-slate-950/50">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      Candidate Answer
                    </p>
                    {item.answer.trim().length > 0 ? (
                      <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                        {item.answer}
                      </p>
                    ) : (
                      <p className="text-xs italic text-slate-400">
                        No verbal or written answer recorded for this question.
                      </p>
                    )}
                  </div>

                  {/* AI Feedback Section */}
                  {score?.feedback && (
                    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 dark:bg-primary/10">
                      <Sparkles
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                          AI Feedback & Evaluation
                        </p>
                        <p className="mt-1 text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                          {score.feedback}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}