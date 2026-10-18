"use client";

import Link from "next/link";
import { CalendarClock, Clock3, ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/features/components/common/Card";
import { Badge, type BadgeStatus } from "@/features/components/common/Badge";
import type { DashboardInterview } from "./TaskTable";

export interface ScheduleWidgetProps {
  interviews?: DashboardInterview[];
}

interface ScheduleEvent {
  id: string;
  title: string;
  fullTitle: string;
  time: string;
  statusLabel: string;
  status: BadgeStatus;
  href: string;
}

function isToday(timestamp: number): boolean {
  const date = new Date(timestamp);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/**
 * Truncates string content cleanly with an ellipsis.
 */
function truncateText(text: string, maxLength: number = 38): string {
  if (!text) return "Interview Session";
  const cleanedText = text.replace(/\s+/g, " ").trim();
  if (cleanedText.length <= maxLength) return cleanedText;
  return `${cleanedText.slice(0, maxLength)}...`;
}

const statusBadge: Record<DashboardInterview["status"], BadgeStatus> = {
  setup: "neutral",
  in_progress: "info",
  completed: "success",
  failed: "warning",
};

export function ScheduleWidget({ interviews = [] }: ScheduleWidgetProps) {
  const events: ScheduleEvent[] = interviews
    .filter((interview) => isToday(interview.startedAt ?? interview.createdAt))
    .sort(
      (a, b) => (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt)
    )
    .slice(0, 5)
    .map((interview) => {
      const rawTitle = interview.jobDescription || "Interview session";
      return {
        id: interview._id,
        title: truncateText(rawTitle, 15),
        fullTitle: rawTitle,
        time: new Date(interview.startedAt ?? interview.createdAt).toLocaleTimeString(
          "en-US",
          { hour: "2-digit", minute: "2-digit" }
        ),
        statusLabel:
          interview.status === "in_progress"
            ? "In Progress"
            : interview.status.charAt(0).toUpperCase() + interview.status.slice(1),
        status: statusBadge[interview.status],
        href:
          interview.status === "completed"
            ? `/interview/${interview._id}/review`
            : `/interview/${interview._id}/lobby`,
      };
    });

  return (
    <Card className="flex h-full flex-col border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/50">
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-100 px-6 py-4 dark:border-slate-800/60">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
          <CalendarClock className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          Today&apos;s Schedule
        </CardTitle>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          {events.length} session{events.length === 1 ? "" : "s"}
        </span>
      </CardHeader>

      <CardContent className="flex-1 p-6">
        {events.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <Clock3 className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              No sessions today
            </p>
            <p className="text-xs text-slate-400">
              Scheduled mock interviews will show up here.
            </p>
          </div>
        ) : (
          <ol className="relative space-y-6 border-l-2 border-slate-200/80 pl-6 dark:border-slate-800">
            {events.map((event) => (
              <li key={event.id} className="group relative">
                {/* Timeline Dot */}
                <span className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-primary shadow-sm transition-transform duration-200 group-hover:scale-125 dark:border-slate-900" />

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {event.time}
                    </p>
                    <Link
                      href={event.href}
                      title={event.fullTitle}
                      className="group/link mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800 transition-colors hover:text-primary dark:text-slate-200 dark:hover:text-primary"
                    >
                      <span className="truncate">{event.title}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-all group-hover/link:translate-x-0.5 group-hover/link:opacity-100" />
                    </Link>
                  </div>

                  <Badge status={event.status} dot>
                    {event.statusLabel}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export default ScheduleWidget;