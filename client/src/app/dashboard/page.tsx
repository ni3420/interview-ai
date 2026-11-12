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

function WorkspaceLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Loading workspace
      </p>
    </div>
  );
}

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

  if (!isLoaded || !isSignedIn) {
    return <WorkspaceLoader />;
  }

  if (interviews === undefined) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Loading sessions
          </p>
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
      <div className="mx-auto w-full max-w-[1120px] pb-16">
        <header className="flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Workspace
            </p>
            <h1 className="mt-3 font-display text-[38px] font-medium leading-[1.02] tracking-[-0.02em] sm:text-[44px]">
              Your practice log
            </h1>
            <p className="mt-2 max-w-[52ch] text-body leading-relaxed text-muted-foreground">
              Every session you have run, the question it stopped on, and the
              report behind it.
            </p>
          </div>

          <Button asChild className="shrink-0" leftIcon={<Plus className="h-4 w-4" />}>
            <Link href="/interview/setup">Start a mock interview</Link>
          </Button>
        </header>

        <StatsOverview interviews={rows} />

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <TaskTable interviews={rows} />
          <div className="flex flex-col gap-10">
            <ScheduleWidget interviews={rows} />
            <NotesWidget />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
