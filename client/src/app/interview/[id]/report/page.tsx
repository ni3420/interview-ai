"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, CheckCircle2, AlertCircle, Lightbulb, Award, TrendingUp, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { evaluateInterview } from "@/lib/ai-service";
import { toast } from "sonner";

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

interface Report {
  _id: string;
  interviewId: string;
  userId: string;
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  questionScores: Array<{
    questionIndex: number;
    score: number;
    feedback: string;
  }>;
  createdAt: number;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getScoreColor(score: number): { color: string; bg: string; label: string } {
  if (score >= 80) return { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", label: "Excellent" };
  if (score >= 60) return { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", label: "Good" };
  return { color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10", label: "Needs Work" };
}

function getScoreIcon(score: number) {
  if (score >= 80) return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
  if (score >= 60) return <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
  return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
}

export default function InterviewReportPage() {
  const params = useParams();
  const interviewId = params.id as string;

  const interview = useQuery(api.interviews.getInterview, { interviewId }) as Interview | undefined;
  const answers = useQuery(api.answers.getAnswers, { interviewId });
  const existingReport = useQuery(api.reports.getReport, { interviewId }) as Report | undefined;
  const saveReport = useMutation(api.reports.saveReport);

  const [report, setReport] = useState<Report | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (existingReport) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReport(existingReport);
      setIsGenerating(false);
    }
  }, [existingReport]);

  const generateReport = useCallback(async () => {
    if (!interview || !answers || answers.length === 0 || hasTriggeredRef.current || existingReport) return;

    hasTriggeredRef.current = true;
    setIsGenerating(true);
    setError(null);

    try {
      const qaPairs = answers
        .sort((a: InterviewAnswer, b: InterviewAnswer) => a.questionIndex - b.questionIndex)
        .map((a: InterviewAnswer) => ({ question: a.question, answer: a.answer }));

      const evaluation = await evaluateInterview({
        resume_text: interview.resumeText ?? "",
        job_description: interview.jobDescription,
        qa_pairs: qaPairs,
      });

      const reportId = await saveReport({
        interviewId,
        overallScore: evaluation.overall_score,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        recommendations: evaluation.recommendations,
        questionScores: evaluation.question_scores.map((qs) => ({
          questionIndex: qs.question_index,
          score: qs.score,
          feedback: qs.feedback,
        })),
      });

      const newReport: Report = {
        _id: reportId as string,
        interviewId,
        userId: interview.userId,
        overallScore: evaluation.overall_score,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses,
        recommendations: evaluation.recommendations,
        questionScores: evaluation.question_scores.map((qs) => ({
          questionIndex: qs.question_index,
          score: qs.score,
          feedback: qs.feedback,
        })),
        createdAt: Date.now(),
      };

      setReport(newReport);
      toast.success("Report generated successfully!");
    } catch (err) {
      console.error("Report generation failed:", err);
      hasTriggeredRef.current = false;
      setError(err instanceof Error ? err.message : "Failed to generate report");
      toast.error("Failed to generate report. You can retry.");
    } finally {
      setIsGenerating(false);
    }
  }, [interview, answers, existingReport, interviewId, saveReport]);

  useEffect(() => {
    if (interview && answers && answers.length > 0 && !existingReport && !report && !hasTriggeredRef.current) {
      generateReport();
    }
  }, [interview, answers, existingReport, report, generateReport]);

  if (!interview) {
    return (
      <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs font-medium text-slate-400">Loading interview details...</p>
        </div>
      </div>
    );
  }

  const questionsList = interview.plan?.questions || [];
  const totalQuestions = questionsList.length;
  const answeredCount = answers?.length || 0;

  const scoreConfig = report ? getScoreColor(report.overallScore) : { color: "text-slate-400", bg: "bg-slate-100 dark:bg-slate-800", label: "Pending" };

  if (isGenerating && !report) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4 bg-white px-4 dark:bg-slate-950">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Analyzing Performance</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
            Evaluating your responses against the target job description...
          </p>
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="container max-w-xl py-20 text-center px-4">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Failed to Generate Report</h1>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{error}</p>
        <Button onClick={() => { hasTriggeredRef.current = false; generateReport(); }} className="mt-6 gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry Generation
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-slate-950">
      {/* Sticky Header */}
      <header className=" top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Dashboard
          </Link>
          <div className="flex items-center gap-2">
            <span className={`${scoreConfig.bg} ${scoreConfig.color} rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1.5 shadow-sm`}>
              {getScoreIcon(report?.overallScore || 0)}
              {scoreConfig.label}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area - Reduced bottom whitespace */}
      <main className="flex-1 py-6 sm:py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="space-y-4 sm:space-y-6 pb-4">
            
            {/* Overview Score Card */}
            <Card className="border-slate-200/80 bg-white/90 shadow-md backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Performance Report
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(interview.createdAt)} • {answeredCount}/{totalQuestions} questions answered
                  {interview.completedAt && ` • Completed ${formatDate(interview.completedAt)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex flex-col items-center gap-3 py-4">
                  {/* Circular Progress Gauge */}
                  <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
                    <svg className="h-full w-full transform -rotate-90">
                      <circle
                        cx="50%"
                        cy="50%"
                        r="44%"
                        stroke="currentColor"
                        strokeWidth="7"
                        fill="none"
                        className="text-slate-100 dark:text-slate-800"
                      />
                      <circle
                        cx="50%"
                        cy="50%"
                        r="44%"
                        stroke="currentColor"
                        strokeWidth="7"
                        strokeDasharray={280}
                        strokeDashoffset={280 * (1 - (report?.overallScore || 0) / 100)}
                        strokeLinecap="round"
                        fill="none"
                        className={`${scoreConfig.color.replace("text-", "stroke-")} transition-all duration-1000`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100">
                        {report?.overallScore || 0}
                      </span>
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Score</span>
                    </div>
                  </div>
                  <div className={`${scoreConfig.bg} ${scoreConfig.color} rounded-full px-4 py-1 text-xs font-semibold shadow-sm`}>
                    {scoreConfig.label} Overall Performance
                  </div>
                </div>
              </CardContent>
            </Card>

            {report && (
              <>
                {/* Strengths Card */}
                <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                      <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      Key Strengths
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      Areas where your responses excelled
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {report.strengths.map((strength, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 rounded-xl bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 sm:text-sm">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Weaknesses Card */}
                <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                      Areas for Improvement
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      Weaknesses to address for future technical interviews
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2.5">
                      {report.weaknesses.map((weakness, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 rounded-xl bg-red-50/70 p-3 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-200 sm:text-sm">
                          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{weakness}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Recommendations Card */}
                <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                      <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      Actionable Recommendations
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      Targeted steps to sharpen your response delivery
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2.5">
                      {report.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-3 rounded-xl bg-amber-50/70 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:text-sm">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200/80 text-[10px] font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed">{rec}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>

                {/* Question Breakdown Card */}
                <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                      <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                      Question Breakdown
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                      Granular performance scores and feedback per question
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {report.questionScores
                        .sort((a, b) => a.questionIndex - b.questionIndex)
                        .map((qs) => {
                          const qConfig = getScoreColor(qs.score);
                          const questionText = questionsList[qs.questionIndex] || `Question ${qs.questionIndex + 1}`;
                          const userAnswer = answers?.find((a: InterviewAnswer) => a.questionIndex === qs.questionIndex)?.answer || "";

                          return (
                            <div key={qs.questionIndex} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 sm:text-sm">
                                    {questionText}
                                  </p>
                                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                                    <span className="font-medium text-slate-700 dark:text-slate-300">Answer: </span>
                                    {userAnswer || "No answer provided"}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <span className={`${qConfig.bg} ${qConfig.color} rounded-full px-2 py-0.5 text-xs font-bold`}>
                                    {qs.score}/100
                                  </span>
                                  {getScoreIcon(qs.score)}
                                </div>
                              </div>
                              <Separator className="bg-slate-200 dark:bg-slate-800" />
                              <div className="flex items-start gap-2">
                                <Badge variant="outline" className="shrink-0 text-[10px] uppercase font-semibold text-slate-600 dark:text-slate-400">
                                  AI Feedback
                                </Badge>
                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                                  {qs.feedback}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Navigation CTA Footer */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button asChild variant="outline" className="flex-1 h-11 rounded-xl">
                <Link href="/dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              <Button asChild className="flex-1 h-11 rounded-xl">
                <Link href={`/interview/${interviewId}/review`}>
                  Review All Answers
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}