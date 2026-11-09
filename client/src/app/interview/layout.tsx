import { Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ContentSkeleton } from "@/components/layout/AppBootSkeleton";

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <Suspense
        fallback={
          <div className="flex flex-1 flex-col">
            <ContentSkeleton />
          </div>
        }
      >
        {children}
      </Suspense>
    </DashboardLayout>
  );
}