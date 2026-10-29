"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useUserSync } from "@/components/layout/UserSyncProvider";
import { Button } from "@/features/components/common/Button";
import { StatsOverview } from "@/features/components/dashboard/StatsOverview";
import {
  TaskTable,
  type DashboardInterview,
} from "@/features/components/dashboard/TaskTable";
import { ScheduleWidget } from "@/features/components/dashboard/ScheduleWidget";
import { NotesWidget } from "@/features/components/dashboard/NotesWidget";
import { Plus } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useUser();
  const { status: syncStatus } = useUserSync();
  const router = useRouter();

  // Fires only after the backend confirms the `users` row; otherwise the query
  // runs against an account that does not exist yet and throws Unauthorized.
  const interviews = useQuery(
    api.interviews.getInterviews,
    syncStatus === "synced" ? {} : "skip"
  ) as DashboardInterview[] | undefined;

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (interviews === undefined) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const rows: DashboardInterview[] = interviews.map((interview) => ({
    _id: interview._id,
    jobDescription: interview.jobDescription,
    status: interview.status,
    plan: interview.plan ?? null,
    currentQuestionIndex: interview.currentQuestionIndex,
    startedAt: interview.startedAt,
    completedAt: interview.completedAt,
    createdAt: interview.createdAt,
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Dashboard
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              Track your interview prep at a glance
            </p>
          </div>

          <Button asChild leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/interview/setup">Start New Interview</Link>
          </Button>
        </div>

        <StatsOverview interviews={rows} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TaskTable interviews={rows} />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
            <ScheduleWidget interviews={rows} />
            <NotesWidget />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
