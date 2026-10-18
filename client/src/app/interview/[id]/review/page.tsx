"use client";

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
} from "lucide-react";
import { Card, CardContent } from "@/features/components/common/Card";
import { Badge, type BadgeStatus } from "@/features/components/common/Badge";
import { Button } from "@/features/components/common/Button";

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

  if (interview === undefined || answers === undefined) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (interview === null) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">Interview not found</h1>
        <p className="text-slate-500 dark:text-slate-400">
          This interview does not exist or you do not have access to it.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const questions = interview.plan?.questions ?? [];
  const answered = new Set(answers.map((answer) => answer.questionIndex));
  const scoreByIndex = new Map(
    (report?.questionScores ?? []).map((score) => [score.questionIndex, score])
  );

  const indices = Array.from(
    new Set([
      ...questions.map((_, index) => index),
      ...answers.map((answer) => answer.questionIndex),
    ])
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="mb-2 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Interview Review
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Badge status={statusBadge[interview.status]} dot>
              {interview.status.replace("_", " ")}
            </Badge>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {answered.size}/{questions.length || indices.length} answered
            </span>
          </div>
        </div>

        {report && (
          <Button asChild leftIcon={<BarChart3 className="h-4 w-4" />}>
            <Link href={`/interview/${interviewId}/report`}>
              View Full Report ({report.overallScore}/100)
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Target role
          </p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {interview.jobDescription}
          </p>
        </CardContent>
      </Card>

      {indices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <MessageSquare className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No questions or answers were recorded for this interview.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-4">
          {indices.map((index) => {
            const answer = answers.find((item) => item.questionIndex === index);
            const question =
              questions[index] ?? answer?.question ?? `Question ${index + 1}`;
            const score = scoreByIndex.get(index);
            return (
              <li key={index}>
                <Card>
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {index + 1}
                        </span>
                        <p className="font-medium">{question}</p>
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

                    <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800/50">
                      <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Your answer
                      </p>
                      {answer && answer.answer.trim().length > 0 ? (
                        <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                          {answer.answer}
                        </p>
                      ) : (
                        <p className="text-sm italic text-slate-400">
                          No answer recorded.
                        </p>
                      )}
                    </div>

                    {score?.feedback && (
                      <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                        <BarChart3
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Feedback
                          </p>
                          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            {score.feedback}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
