import { Suspense } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
        {children}
      </Suspense>
    </DashboardLayout>
  );
}