"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Bot, FileText, Play, RefreshCw, PlusCircle, Calendar } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/features/components/common/Card";
import { Badge, type BadgeStatus } from "@/features/components/common/Badge";
import { Button } from "@/features/components/common/Button";

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
  { label: string; badge: BadgeStatus }
> = {
  setup: { label: "Pending", badge: "neutral" },
  in_progress: { label: "In Progress", badge: "info" },
  completed: { label: "Completed", badge: "success" },
  failed: { label: "Failed", badge: "warning" },
};

function actionFor(interview: DashboardInterview): {
  label: string;
  href: string;
  icon: typeof Play;
} {
  switch (interview.status) {
    case "setup":
      return {
        label: "Enter Lobby",
        href: `/interview/${interview._id}/lobby`,
        icon: Play,
      };
    case "completed":
      return {
        label: "Review",
        href: `/interview/${interview._id}/review`,
        icon: FileText,
      };
    case "failed":
      return { label: "Retry", href: "/interview/setup", icon: RefreshCw };
    default:
      return {
        label: "Continue",
        href: `/interview/${interview._id}`,
        icon: Play,
      };
  }
}

/**
 * Truncate long descriptions smoothly with an ellipsis.
 */
function truncateText(text: string, maxLength: number = 45): string {
  if (!text) return "Untitled Interview Session";
  const cleanedText = text.replace(/\s+/g, " ").trim();
  if (cleanedText.length <= maxLength) return cleanedText;
  return `${cleanedText.slice(0, maxLength)}...`;
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

export function TaskTable({ interviews }: TaskTableProps) {
  const { user } = useUser();
  const userName = user?.fullName ?? user?.username ?? "You";
  const initial = userName.charAt(0).toUpperCase();

  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/50">
      <CardHeader className="flex-row items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6 dark:border-slate-800/60">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent Interviews
          </CardTitle>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {interviews.length}
          </span>
        </div>
        <Button asChild size="sm" variant="ghost" leftIcon={<PlusCircle className="h-4 w-4" />}>
          <Link href="/interview/setup">New Interview</Link>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {interviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <FileText className="h-6 w-6 text-slate-400 dark:text-slate-500" />
            </div>
            <div className="max-w-xs">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No interviews created
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Start your first mock session to begin tracking performance and receiving AI feedback.
              </p>
            </div>
            <Button asChild size="sm" className="mt-2">
              <Link href="/interview/setup">Start New Interview</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* MOBILE VIEW: Stacked Cards (< md screens) */}
            <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800/60">
              {interviews.map((interview) => {
                const meta = statusMeta[interview.status];
                const action = actionFor(interview);
                const ActionIcon = action.icon;
                const totalQuestions = interview.plan?.questions?.length || 5;

                return (
                  <div key={interview._id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {truncateText(interview.jobDescription, 35)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(interview.createdAt)}
                          </span>
                          <span>•</span>
                          <span>Q{interview.currentQuestionIndex + 1} of {totalQuestions}</span>
                        </div>
                      </div>
                      <Badge status={meta.badge} dot>
                        {meta.label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {/* Participant avatars */}
                      <div className="flex items-center -space-x-1.5">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 ring-2 ring-white dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-900"
                          title={`Candidate: ${userName}`}
                        >
                          {initial}
                        </span>
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary ring-2 ring-white dark:ring-slate-900"
                          title="Interviewer: AI Agent"
                        >
                          <Bot className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </div>

                      {/* Action Button */}
                      <Button
                        asChild
                        size="sm"
                        variant={interview.status === "completed" ? "outline" : "primary"}
                        leftIcon={<ActionIcon className="h-3.5 w-3.5" />}
                      >
                        <Link href={action.href}>{action.label}</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP/TABLET VIEW: Traditional Table (>= md screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
                    <th className="px-6 py-3.5">Interview Session</th>
                    <th className="px-6 py-3.5">Participants</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {interviews.map((interview) => {
                    const meta = statusMeta[interview.status];
                    const action = actionFor(interview);
                    const ActionIcon = action.icon;
                    const totalQuestions = interview.plan?.questions?.length || 5;
                    const truncatedDesc = truncateText(interview.jobDescription, 50);

                    return (
                      <tr
                        key={interview._id}
                        className="group transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        {/* Job Description Title & Meta */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-0.5">
                            <p
                              className="font-medium text-slate-900 transition-colors group-hover:text-primary dark:text-slate-100"
                              title={interview.jobDescription || "Interview session"}
                            >
                              {truncatedDesc}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(interview.createdAt)}
                              </span>
                              <span>•</span>
                              <span>
                                Question {interview.currentQuestionIndex + 1} of {totalQuestions}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Participant Avatars */}
                        <td className="px-6 py-4 align-middle">
                          <div className="flex items-center -space-x-1.5">
                            <span
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ring-2 ring-white dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-900"
                              title={`Candidate: ${userName}`}
                            >
                              {initial}
                            </span>
                            <span
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary ring-2 ring-white dark:ring-slate-900"
                              title="Interviewer: AI Agent"
                            >
                              <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="px-6 py-4 align-middle">
                          <Badge status={meta.badge} dot>
                            {meta.label}
                          </Badge>
                        </td>

                        {/* Action Button */}
                        <td className="px-6 py-4 align-middle text-right">
                          <Button
                            asChild
                            size="sm"
                            variant={interview.status === "completed" ? "outline" : "primary"}
                            leftIcon={<ActionIcon className="h-3.5 w-3.5" />}
                          >
                            <Link href={action.href}>{action.label}</Link>
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
  );
}

export default TaskTable;