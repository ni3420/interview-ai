"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
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
  status: DashboardInterview["status"];
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

function truncateText(text: string, maxLength: number = 38): string {
  if (!text) return "Interview session";
  const cleanedText = text.replace(/\s+/g, " ").trim();
  if (cleanedText.length <= maxLength) return cleanedText;
  return `${cleanedText.slice(0, maxLength)}…`;
}

const statusCopy: Record<DashboardInterview["status"], string> = {
  setup: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
};

const statusDot: Record<DashboardInterview["status"], string> = {
  setup: "bg-muted-foreground",
  in_progress: "bg-info",
  completed: "bg-success",
  failed: "bg-warning",
};

export function ScheduleWidget({ interviews = [] }: ScheduleWidgetProps) {
  const events: ScheduleEvent[] = interviews
    .filter((interview) => isToday(interview.startedAt ?? interview.createdAt))
    .sort((a, b) => (a.startedAt ?? a.createdAt) - (b.startedAt ?? b.createdAt))
    .slice(0, 5)
    .map((interview) => {
      const rawTitle = interview.jobDescription || "Interview session";
      return {
        id: interview._id,
        title: truncateText(rawTitle, 26),
        fullTitle: rawTitle,
        time: new Date(interview.startedAt ?? interview.createdAt).toLocaleTimeString(
          "en-US",
          { hour: "2-digit", minute: "2-digit" }
        ),
        statusLabel: statusCopy[interview.status],
        status: interview.status,
        href:
          interview.status === "completed"
            ? `/interview/${interview._id}/review`
            : `/interview/${interview._id}/lobby`,
      };
    });

  return (
    <section aria-labelledby="today-schedule">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2
          id="today-schedule"
          className="font-display text-[22px] font-medium tracking-[-0.01em]"
        >
          Today
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {events.length}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 border-b border-border pb-5 text-caption leading-relaxed text-muted-foreground">
          Nothing on the clock today. A session appears here once you start one.
        </p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id} className="border-b border-border py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  {event.time}
                </p>
                <span className="inline-flex items-center gap-1.5 text-micro text-muted-foreground">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${statusDot[event.status]}`}
                    aria-hidden="true"
                  />
                  {event.statusLabel}
                </span>
              </div>
              <Link
                href={event.href}
                title={event.fullTitle}
                className="group mt-1 flex items-start justify-between gap-2"
              >
                <span className="text-[13.5px] font-medium leading-snug text-foreground">
                  {event.title}
                </span>
                <ArrowUpRight
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ScheduleWidget;
