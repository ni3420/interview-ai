"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, CheckCircle, AlertCircle, Lightbulb, Award, TrendingUp, Loader2, RefreshCw } from "lucide-react";
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
    month: "long",
    day: "numeric",
  });
}

function getScoreColor(score: number): { color: string; bg: string; label: string } {
  if (score >= 80) return { color: "text-green-600", bg: "bg-green-600/10", label: "Excellent" };
  if (score >= 60) return { color: "text-yellow-600", bg: "bg-yellow-600/10", label: "Good" };
  return { color: "text-destructive", bg: "bg-destructive/10", label: "Needs Work" };
}

function getScoreIcon(score: number) {
  if (score >= 80) return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (score >= 60) return <TrendingUp className="h-4 w-4 text-yellow-600" />;
  return <AlertCircle className="h-4 w-4 text-destructive" />;
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

  // Ref to prevent multiple concurrent triggers
  const hasTriggeredRef = useRef(false);

  // Sync existing report when loaded from database
  useEffect(() => {
    if (existingReport) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting the persisted report from the Convex query
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
      toast.success("Report generated!");
    } catch (err) {
      console.error("Report generation failed:", err);
      hasTriggeredRef.current = false; // Allow retry on failure
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
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const questionsList = interview.plan?.questions || [];
  const totalQuestions = questionsList.length;
  const answeredCount = answers?.length || 0;

  const scoreConfig = report ? getScoreColor(report.overallScore) : { color: "text-muted-foreground", bg: "bg-muted", label: "Pending" };

  if (isGenerating && !report) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Analyzing your interview and generating detailed feedback...</p>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="container max-w-3xl py-12 text-center">
        <AlertCircle className="mx-auto h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Failed to Generate Report</h1>
        <p className="text-muted-foreground mb-6">{error}</p>
        <Button onClick={() => { hasTriggeredRef.current = false; generateReport(); }} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="container flex h-16 items-center justify-between px-4">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-4">
            <span className={scoreConfig.bg + " " + scoreConfig.color + " rounded-full px-3 py-1 text-sm font-medium flex items-center gap-1"}>
              {getScoreIcon(report?.overallScore || 0)}
              {scoreConfig.label}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 py-8">
        <div className="container max-w-3xl">
          <div className="space-y-6">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Interview Report</CardTitle>
                <CardDescription>
                  {formatDate(interview.createdAt)} • {answeredCount}/{totalQuestions} questions answered
                  {interview.completedAt && ` • Completed ${formatDate(interview.completedAt)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="relative w-32 h-32">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="currentColor"
                        strokeWidth="8"
                        fill="none"
                        className="text-muted bg-muted"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeDasharray={352}
                        strokeDashoffset={352 * (1 - (report?.overallScore || 0) / 100)}
                        strokeLinecap="round"
                        fill="none"
                        className={scoreConfig.color.replace("text-", "stroke-") + " transition-all duration-1000"}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl font-bold">
                        {report?.overallScore || 0}
                      </span>
                    </div>
                  </div>
                  <div className={scoreConfig.bg + " " + scoreConfig.color + " rounded-full px-4 py-1 text-lg font-semibold"}>
                    {scoreConfig.label}
                  </div>
                </div>
              </CardContent>
            </Card>

            {report && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-green-600" />
                      Strengths
                    </CardTitle>
                    <CardDescription>Areas where you performed well</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {report.strengths.map((strength, idx) => (
                        <li key={idx} className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          <p className="text-sm">{strength}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      Areas for Improvement
                    </CardTitle>
                    <CardDescription>Weaknesses to address for future interviews</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {report.weaknesses.map((weakness, idx) => (
                        <li key={idx} className="flex items-start gap-3 p-3 bg-destructive/5 dark:bg-destructive/10 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                          <p className="text-sm">{weakness}</p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-600" />
                      Recommendations
                    </CardTitle>
                    <CardDescription>Actionable steps to improve</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-2">
                      {report.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs font-medium flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <p className="text-sm">{rec}</p>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Question-by-Question Breakdown
                    </CardTitle>
                    <CardDescription>Detailed feedback for each answer</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {report.questionScores
                        .sort((a: { questionIndex: number }, b: { questionIndex: number }) => a.questionIndex - b.questionIndex)
                        .map((qs) => {
                          const qConfig = getScoreColor(qs.score);
                          const questionText = questionsList[qs.questionIndex] || `Question ${qs.questionIndex + 1}`;
                          const userAnswer = answers?.find((a: InterviewAnswer) => a.questionIndex === qs.questionIndex)?.answer || "";

                          return (
                            <div key={qs.questionIndex} className="border rounded-lg p-4 space-y-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{questionText}</p>
                                  <p className="text-xs text-muted-foreground mt-1 max-h-20 overflow-hidden">{userAnswer || "No answer provided"}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  <span className={qConfig.bg + " " + qConfig.color + " rounded-full px-2 py-0.5 text-xs font-medium"}>
                                    {qs.score}/100
                                  </span>
                                  {getScoreIcon(qs.score)}
                                </div>
                              </div>
                              <Separator />
                              <div className="flex items-start gap-2">
                                <Badge variant="outline" className="flex-shrink-0 mt-0.5">
                                  Feedback
                                </Badge>
                                <p className="text-sm text-muted-foreground flex-1">{qs.feedback}</p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            <div className="flex gap-4 justify-center pt-4">
              <Button asChild variant="outline" size="lg">
                <Link href="/dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Dashboard
                </Link>
              </Button>
              <Button asChild size="lg">
                <Link href={`/interview/${interviewId}`}>
                  Review Interview
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}