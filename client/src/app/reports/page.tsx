"use client";

import * as React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useUserSync } from "@/components/layout/UserSyncProvider";
import {
  Award,
  BarChart3,
  CheckCircle2,
  Target,
  Calendar,
  ExternalLink,
} from "lucide-react";
import { MetricSummaryCard } from "@/features/components/reports/MetricSummaryCard";
import {
  AnalyticsChart,
  type ChartPoint,
} from "@/features/components/reports/AnalyticsChart";
import {
  ExportToolbar,
  type DateRange,
} from "@/features/components/reports/ExportToolbar";
import { Card, CardContent } from "@/features/components/common/Card";
import { Badge } from "@/features/components/common/Badge";
import { Button } from "@/features/components/common/Button";
import {
  formatScore,
  reportScoreScale,
  RUBRIC_SCORE_SCALE,
} from "@/lib/interview-report";

interface ReportRecord {
  _id: string;
  interviewId: string;
  overallScore: number | null;
  scoreScale?: number;
  createdAt: number;
}

interface InterviewRecord {
  _id: string;
  jobDescription: string;
  status: "setup" | "in_progress" | "completed" | "failed";
  completedAt?: number;
  createdAt: number;
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function withinRange(timestamp: number, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  const day = timestamp;
  const from = range.from ? new Date(`${range.from}T00:00:00`).getTime() : -Infinity;
  const to = range.to ? new Date(`${range.to}T23:59:59`).getTime() : Infinity;
  return day >= from && day <= to;
}

/**
 * Truncates long job descriptions smoothly with an ellipsis.
 */
function truncateText(text: string, maxLength: number = 45): string {
  if (!text) return "Interview Session";
  const cleanedText = text.replace(/\s+/g, " ").trim();
  if (cleanedText.length <= maxLength) return cleanedText;
  return `${cleanedText.slice(0, maxLength)}...`;
}

// Legacy reports are 0-100 and rubric reports are 0-10. Analytics averages
// mixed scales, so normalise each score to a percentage first.
function scorePercent(report: ReportRecord): number | null {
  if (typeof report.overallScore !== "number") return null;
  return reportScoreScale(report) === RUBRIC_SCORE_SCALE
    ? report.overallScore * 10
    : report.overallScore;
}

function scoreBadgeStatus(
  percent: number | null
): "success" | "warning" | "neutral" {
  if (percent === null) return "neutral";
  if (percent >= 80) return "success";
  if (percent >= 60) return "warning";
  return "neutral";
}

export default function ReportsPage() {
  const { isLoaded, isSignedIn } = useUser();
  const { status: syncStatus } = useUserSync();
  const router = useRouter();

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [range, setRange] = React.useState<DateRange>({
    from: toDateInput(monthAgo),
    to: toDateInput(today),
  });

  const reports = useQuery(
    api.reports.getUserReports,
    syncStatus === "synced" ? {} : "skip"
  ) as ReportRecord[] | undefined;
  const interviews = useQuery(
    api.interviews.getInterviews,
    syncStatus === "synced" ? {} : "skip"
  ) as InterviewRecord[] | undefined;

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn || reports === undefined || interviews === undefined) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs font-medium text-slate-400">Loading reports...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const roleById = new Map(
    interviews.map((interview) => [
      interview._id,
      interview.jobDescription || "Interview session",
    ])
  );

  const filtered = reports.filter((report) => withinRange(report.createdAt, range));

  const scores = reports
    .map(scorePercent)
    .filter((score): score is number => score !== null);
  const avgScore =
    scores.length === 0
      ? 0
      : Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  const bestScore = scores.length === 0 ? 0 : Math.max(...scores);
  const completed = interviews.filter((item) => item.status === "completed").length;

  const chartData: ChartPoint[] = filtered
    .filter((report) => scorePercent(report) !== null)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-8)
    .map((report) => ({
      label: new Date(report.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      value: scorePercent(report) as number,
    }));

  const exportRows = filtered.map((report) => ({
    Date: new Date(report.createdAt).toLocaleDateString("en-US"),
    Role: roleById.get(report.interviewId) ?? "Interview session",
    Score: formatScore(report.overallScore, reportScoreScale(report)),
  }));

  return (
    <DashboardLayout>
      {/* Reduced bottom padding and tighter layout vertical spacing on mobile */}
      <div className="space-y-4 pb-3 sm:space-y-8 sm:pb-8">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800/80 sm:pb-5">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              Analytics &amp; Reports
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
              Track mock interview performance over time.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" leftIcon={<BarChart3 className="h-4 w-4" />}>
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>

        {/* Metric Summary Grid */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <MetricSummaryCard
            label="Total Sessions"
            value={String(interviews.length)}
            deltaLabel={`${completed} completed`}
            icon={BarChart3}
          />
          <MetricSummaryCard
            label="Average Score"
            value={`${avgScore}%`}
            deltaLabel="Normalised across scales"
            icon={Target}
            accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          />
          <MetricSummaryCard
            label="Best Score"
            value={`${bestScore}%`}
            deltaLabel="Personal record"
            icon={Award}
            accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          />
          <MetricSummaryCard
            label="Reports"
            value={String(reports.length)}
            deltaLabel="All time"
            icon={CheckCircle2}
            accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
        </div>

        {/* Export Options & Range Picker Toolbar */}
        <ExportToolbar
          range={range}
          onRangeChange={setRange}
          rows={exportRows}
          filename="interview-analytics.csv"
        />

        {/* Interactive Performance Trend Chart */}
        <AnalyticsChart
          data={chartData}
          description="Performance scores per interview within the selected range"
          emptyLabel="No scored interviews found within this range."
        />

        {/* Detailed Reports Data Section */}
        <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/50">
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center sm:py-12">
                <BarChart3 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 sm:text-sm">
                  No reports in range
                </p>
                <p className="text-[11px] text-slate-400">
                  Try adjusting the date filters above.
                </p>
              </div>
            ) : (
              <>
                {/* MOBILE VIEW: Compact Card List (< md screens) */}
                <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800/60">
                  {filtered
                    .slice()
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((report) => {
                      const fullRole = roleById.get(report.interviewId) ?? "Interview session";
                      return (
                        <div key={report._id} className="flex flex-col gap-2 p-3 sm:p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">
                                {truncateText(fullRole, 28)}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                                <Calendar className="h-3 w-3" />
                                {new Date(report.createdAt).toLocaleDateString("en-US")}
                              </p>
                            </div>
                            <Badge
                              status={scoreBadgeStatus(scorePercent(report))}
                            >
                              {formatScore(
                                report.overallScore,
                                reportScoreScale(report)
                              )}
                            </Badge>
                          </div>

                          <div className="flex justify-end pt-1">
                            <Button asChild size="sm" variant="outline" rightIcon={<ExternalLink className="h-3 w-3" />}>
                              <Link href={`/interview/${report.interviewId}/review`}>
                                View Report
                              </Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* DESKTOP VIEW: Structured Table (>= md screens) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                        <th className="px-6 py-3.5">Date</th>
                        <th className="px-6 py-3.5">Role / Position</th>
                        <th className="px-6 py-3.5">Overall Score</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {filtered
                        .slice()
                        .sort((a, b) => b.createdAt - a.createdAt)
                        .map((report) => {
                          const fullRole = roleById.get(report.interviewId) ?? "Interview session";
                          return (
                            <tr
                              key={report._id}
                              className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                            >
                              <td className="px-6 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                                {new Date(report.createdAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </td>
                              <td className="px-6 py-4">
                                <p
                                  className="font-medium text-slate-900 transition-colors group-hover:text-primary dark:text-slate-100"
                                  title={fullRole}
                                >
                                  {truncateText(fullRole, 48)}
                                </p>
                              </td>
                              <td className="px-6 py-4">
                                <Badge
                                  status={scoreBadgeStatus(scorePercent(report))}
                                >
                                  {formatScore(
                                    report.overallScore,
                                    reportScoreScale(report)
                                  )}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Button asChild size="sm" variant="outline">
                                  <Link href={`/interview/${report.interviewId}/review`}>
                                    View
                                  </Link>
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}