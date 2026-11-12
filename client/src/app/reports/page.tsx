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
import { ArrowLeft } from "lucide-react";
import { MetricSummaryCard } from "@/features/components/reports/MetricSummaryCard";
import {
  AnalyticsChart,
  type ChartPoint,
} from "@/features/components/reports/AnalyticsChart";
import {
  ExportToolbar,
  type DateRange,
} from "@/features/components/reports/ExportToolbar";
import { Badge } from "@/features/components/common/Badge";
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
  const from = range.from
    ? new Date(`${range.from}T00:00:00`).getTime()
    : -Infinity;
  const to = range.to ? new Date(`${range.to}T23:59:59`).getTime() : Infinity;
  return day >= from && day <= to;
}

/**
 * Truncates long job descriptions smoothly with an ellipsis.
 */
function truncateText(text: string, maxLength: number = 45): string {
  if (!text) return "Interview session";
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

  if (
    !isLoaded ||
    !isSignedIn ||
    reports === undefined ||
    interviews === undefined
  ) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Loading reports
            </p>
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

        <header className="mt-6 border-b border-border pb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Reports
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">
            Progress over time
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Every scored session, side by side. Filter by date, read the trend,
            and open a full report.
          </p>
        </header>

        <div className="grid grid-cols-2 divide-border border-b border-border sm:grid-cols-4 sm:divide-x">
          <MetricSummaryCard
            label="Sessions"
            value={String(interviews.length)}
            deltaLabel={`${completed} completed`}
          />
          <MetricSummaryCard
            label="Average"
            value={`${avgScore}%`}
            deltaLabel="Normalised across scales"
          />
          <MetricSummaryCard
            label="Best"
            value={`${bestScore}%`}
            deltaLabel="Personal record"
          />
          <MetricSummaryCard
            label="Reports"
            value={String(reports.length)}
            deltaLabel="All time"
          />
        </div>

        <div className="mt-6">
          <ExportToolbar
            range={range}
            onRangeChange={setRange}
            rows={exportRows}
            filename="interview-analytics.csv"
          />
        </div>

        <div className="mt-8">
          <AnalyticsChart
            data={chartData}
            description="Scores per interview in range"
            emptyLabel="No scored interviews found within this range."
          />
        </div>

        <section className="mt-10">
          <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
            <h2 className="font-display text-2xl leading-none tracking-tight text-foreground">
              All reports
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {filtered.length} in range
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              No reports in this range. Try widening the dates above.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered
                .slice()
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((report) => {
                  const fullRole =
                    roleById.get(report.interviewId) ?? "Interview session";
                  return (
                    <li key={report._id}>
                      <Link
                        href={`/interview/${report.interviewId}/review`}
                        className="group flex items-center justify-between gap-4 py-4"
                      >
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-signal sm:text-[15px]"
                            title={fullRole}
                          >
                            {truncateText(fullRole, 64)}
                          </p>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            {new Date(report.createdAt).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <Badge status={scoreBadgeStatus(scorePercent(report))}>
                            {formatScore(
                              report.overallScore,
                              reportScoreScale(report)
                            )}
                          </Badge>
                          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors group-hover:text-foreground sm:inline">
                            Open
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
