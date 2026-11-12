"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ArrowUpRight, Bot, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardInterview {
  _id: string;
  jobDescription: string;
  status: "setup" | "in_progress" | "completed" | "failed";
  plan?: { questions?: string[] } | null;
  currentQuestionIndex: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
}

export interface TaskTableProps {
  interviews: DashboardInterview[];
}

const statusMeta: Record<
  DashboardInterview["status"],
  { label: string; dot: string }
> = {
  setup: { label: "Pending", dot: "bg-muted-foreground" },
  in_progress: { label: "In progress", dot: "bg-info" },
  completed: { label: "Completed", dot: "bg-success" },
  failed: { label: "Failed", dot: "bg-warning" },
};

function actionFor(interview: DashboardInterview): { label: string; href: string } {
  switch (interview.status) {
    case "setup":
      return { label: "Enter lobby", href: `/interview/${interview._id}/lobby` };
    case "completed":
      return { label: "Read report", href: `/interview/${interview._id}/review` };
    case "failed":
      return { label: "Retry", href: "/interview/setup" };
    default:
      return { label: "Continue", href: `/interview/${interview._id}` };
  }
}

/**
 * Truncate long descriptions smoothly with an ellipsis.
 */
function truncateText(text: string, maxLength: number = 45): string {
  if (!text) return "Untitled interview session";
  const cleanedText = text.replace(/\s+/g, " ").trim();
  if (cleanedText.length <= maxLength) return cleanedText;
  return `${cleanedText.slice(0, maxLength)}…`;
}

/**
 * Format timestamp into readable date string.
 */
function formatDate(timestamp: number): string {
  if (!timestamp) return "Recent";
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusMark({ status }: { status: DashboardInterview["status"] }) {
  const meta = statusMeta[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-caption text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function ActionLink({ interview }: { interview: DashboardInterview }) {
  const action = actionFor(interview);
  return (
    <Link
      href={action.href}
      className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
    >
      {action.label}
      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}

export function TaskTable({ interviews }: TaskTableProps) {
  const { user } = useUser();
  const userName = user?.fullName ?? user?.username ?? "You";
  const initial = userName.charAt(0).toUpperCase();

  return (
    <section aria-labelledby="recent-interviews">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2
          id="recent-interviews"
          className="font-display text-[22px] font-medium tracking-[-0.01em]"
        >
          Recent sessions
        </h2>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {interviews.length}
        </span>
      </div>

      {interviews.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3 border border-dashed border-border px-6 py-12">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            No sessions yet
          </p>
          <p className="max-w-[38ch] font-display text-[24px] font-medium leading-[1.15] tracking-[-0.015em]">
            Run one interview before the one that counts.
          </p>
          <p className="max-w-[48ch] text-caption leading-relaxed text-muted-foreground">
            Upload a resume and the role description. Questions are generated from
            both, then scored with a quote behind each score.
          </p>
          <Link
            href="/interview/setup"
            className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start a mock interview
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          {/* MOBILE VIEW: stacked rows (< md screens) */}
          <ul className="md:hidden">
            {interviews.map((interview) => {
              const totalQuestions = interview.plan?.questions?.length || 5;
              return (
                <li
                  key={interview._id}
                  className="border-b border-border py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={actionFor(interview).href}
                      className="text-[14px] font-medium leading-snug text-foreground"
                    >
                      {truncateText(interview.jobDescription, 42)}
                    </Link>
                    <StatusMark status={interview.status} />
                  </div>
                  <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    {formatDate(interview.createdAt)}
                    <span aria-hidden="true"> · </span>
                    Q{interview.currentQuestionIndex + 1}/{totalQuestions}
                    <span aria-hidden="true"> · </span>
                    {userName} + AI
                  </p>
                  <div className="mt-3">
                    <ActionLink interview={interview} />
                  </div>
                </li>
              );
            })}
          </ul>

          {/* DESKTOP VIEW: ruled table (>= md screens) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[620px] text-left">
              <caption className="sr-only">
                Interview sessions with status and the next available action.
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2.5 pr-4 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Session
                  </th>
                  <th className="py-2.5 pr-4 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Voices
                  </th>
                  <th className="py-2.5 pr-4 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Status
                  </th>
                  <th className="py-2.5 text-right font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {interviews.map((interview) => {
                  const totalQuestions = interview.plan?.questions?.length || 5;
                  return (
                    <tr
                      key={interview._id}
                      className="border-b border-border align-middle transition-colors hover:bg-muted/40"
                    >
                      <td className="py-4 pr-4">
                        <Link
                          href={actionFor(interview).href}
                          title={interview.jobDescription || "Interview session"}
                          className="text-[14px] font-medium leading-snug text-foreground"
                        >
                          {truncateText(interview.jobDescription, 54)}
                        </Link>
                        <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                          {formatDate(interview.createdAt)}
                          <span aria-hidden="true"> · </span>
                          Question {interview.currentQuestionIndex + 1} of{" "}
                          {totalQuestions}
                        </p>
                      </td>

                      <td className="py-4 pr-4">
                        <div className="flex items-center -space-x-1">
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background font-mono text-[10px] font-semibold text-foreground"
                            title={`Candidate: ${userName}`}
                          >
                            {initial}
                          </span>
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
                            title="Interviewer: AI agent"
                          >
                            <Bot className="h-3 w-3" aria-hidden="true" />
                          </span>
                        </div>
                      </td>

                      <td className="py-4 pr-4">
                        <StatusMark status={interview.status} />
                      </td>

                      <td className="py-4 text-right">
                        <ActionLink interview={interview} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {interviews.length > 0 && (
        <div className="mt-4 flex items-center justify-end">
          <Link
            href="/interview/setup"
            className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <FileText className="h-3 w-3" aria-hidden="true" />
            New interview
          </Link>
        </div>
      )}
    </section>
  );
}

export default TaskTable;
