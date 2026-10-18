"use client";

import { useEffect, useState } from "react";
import { Clock, ListChecks, TrendingDown, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/features/components/common/Card";
import type { DashboardInterview } from "./TaskTable";

export interface StatsOverviewProps {
  interviews: DashboardInterview[];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTES_PER_INTERVIEW = 15;

function formatDuration(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

interface Stat {
  label: string;
  value: string;
  hint: string;
  trend: number;
  icon: LucideIcon;
  accent: string;
}

export function StatsOverview({ interviews }: StatsOverviewProps) {
  const [now, setNow] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capture a render-independent reference time
    setNow(Date.now());
  }, []);

  const completed = interviews.filter((item) => item.status === "completed");
  const inProgress = interviews.filter(
    (item) => item.status === "in_progress" || item.status === "setup"
  );

  const completedThisWeek = completed.filter(
    (item) => (item.completedAt ?? item.createdAt) >= now - WEEK_MS
  ).length;
  const completedLastWeek = completed.filter((item) => {
    const at = item.completedAt ?? item.createdAt;
    return at >= now - 2 * WEEK_MS && at < now - WEEK_MS;
  }).length;

  const minutesSaved = completed.length * MINUTES_PER_INTERVIEW;
  const trend =
    completedLastWeek === 0
      ? completedThisWeek > 0
        ? 100
        : 0
      : Math.round(((completedThisWeek - completedLastWeek) / completedLastWeek) * 100);

  const stats: Stat[] = [
    {
      label: "Time Saved",
      value: formatDuration(minutesSaved),
      hint: "Estimated vs. manual prep",
      trend,
      icon: Clock,
      accent: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    {
      label: "Interviews Completed",
      value: String(completed.length),
      hint: `${completedThisWeek} this week`,
      trend,
      icon: Trophy,
      accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "In Progress",
      value: String(inProgress.length),
      hint: "Awaiting completion",
      trend: 0,
      icon: ListChecks,
      accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => {
        const Icon = stat.icon;
        const isUp = stat.trend >= 0;
        const showTrend = stat.trend !== 0;
        return (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight">
                    {stat.value}
                  </p>
                </div>
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.accent}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {showTrend && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isUp
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                    }`}
                  >
                    {isUp ? (
                      <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="h-3 w-3" aria-hidden="true" />
                    )}
                    {isUp ? "+" : ""}
                    {stat.trend}%
                  </span>
                )}
                <span className="text-xs text-slate-400">{stat.hint}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default StatsOverview;
