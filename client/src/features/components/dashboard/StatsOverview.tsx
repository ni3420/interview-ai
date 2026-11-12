"use client";

import { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
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
      label: "Time saved",
      value: formatDuration(minutesSaved),
      hint: "Estimated against manual prep",
      trend,
    },
    {
      label: "Sessions completed",
      value: String(completed.length),
      hint: `${completedThisWeek} this week`,
      trend,
    },
    {
      label: "In progress",
      value: String(inProgress.length),
      hint: "Waiting to be finished",
      trend: 0,
    },
  ];

  return (
    <section
      aria-label="Practice summary"
      className="mt-8 grid divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"
    >
      {stats.map((stat, index) => {
        const showTrend = stat.trend !== 0;
        const isUp = stat.trend >= 0;
        return (
          <div
            key={stat.label}
            className={
              index === 0
                ? "py-6 sm:pr-8"
                : index === 1
                  ? "py-6 sm:px-8"
                  : "py-6 sm:pl-8"
            }
          >
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-2 font-display text-[40px] font-medium leading-none tracking-[-0.02em] tabular-nums">
              {stat.value}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {showTrend && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-foreground">
                  {isUp ? (
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="h-3 w-3" aria-hidden="true" />
                  )}
                  {isUp ? "+" : ""}
                  {stat.trend}%
                </span>
              )}
              <span className="text-micro text-muted-foreground">{stat.hint}</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default StatsOverview;
