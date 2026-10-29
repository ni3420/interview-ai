"use client";

import { ReactNode, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Sidebar,
  type RecentProject,
} from "@/features/components/layout/Sidebar";
import { Navbar } from "@/features/components/layout/Navbar";
import { RequireSyncedUser } from "./RequireSyncedUser";
import { useUserSync } from "./UserSyncProvider";

interface DashboardLayoutProps {
  children: ReactNode;
}

interface DashboardInterviewSummary {
  _id: string;
  status: "setup" | "in_progress" | "completed" | "failed";
  jobDescription: string;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { status: syncStatus } = useUserSync();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const interviews = useQuery(
    api.interviews.getInterviews,
    syncStatus === "synced" ? {} : "skip"
  ) as DashboardInterviewSummary[] | undefined;

  const recentProjects: RecentProject[] = (interviews ?? [])
    .slice(0, 5)
    .map((interview) => ({
      id: interview._id,
      title:
        interview.status === "completed"
          ? "Completed interview"
          : "Interview session",
      subtitle: interview.jobDescription.slice(0, 40),
    }));

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar
        recentProjects={recentProjects}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar
          isMobileMenuOpen={mobileNavOpen}
          onMobileMenuToggle={() => setMobileNavOpen((open) => !open)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <RequireSyncedUser>{children}</RequireSyncedUser>
        </main>
      </div>
    </div>
  );
}
