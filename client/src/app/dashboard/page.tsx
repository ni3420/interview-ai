"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Plus,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "@/lib/date-utils";

interface Interview {
  _id: string;
  userId: string;
  resumeText: string;
  jobDescription: string;
  status: "setup" | "in_progress" | "completed" | "failed";
  plan?: { questions?: string[]; focus_areas?: string[] } | null;
  currentQuestionIndex: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  // Clerk load hone aur user sign-in hone par hi Convex query chalegi, warna "skip" rahegi
  const interviews = useQuery(
    api.interviews.getInterviews,
    isLoaded && isSignedIn ? {} : "skip"
  );

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // 1. Jab tak Clerk load nahi ho raha, tab tak loading spinner dikhao
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  // 2. Agar user signed in nahi hai, toh redirect hone tak loading dikhao
  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  // 3. Jab tak Convex se interviews ka data fetch ho raha hai (undefined state), tab tak layout ke andar loading spinner dikhao
  if (interviews === undefined) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const statusConfig: Record<
    string,
    { label: string; icon: LucideIcon; color: string; bg: string }
  > = {
    setup: {
      label: "Setup",
      icon: FileText,
      color: "text-muted-foreground",
      bg: "bg-muted",
    },
    in_progress: {
      label: "In Progress",
      icon: Clock,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    completed: {
      label: "Completed",
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-600/10",
    },
    failed: {
      label: "Failed",
      icon: AlertCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              Manage your interview preparation sessions
            </p>
          </div>

          <Button asChild>
            <Link href="/interview/setup">
              <Plus className="mr-2 h-4 w-4" />
              Start New Interview
            </Link>
          </Button>
        </div>

        {interviews.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">
                No interviews yet
              </h3>
              <p className="mt-2 text-muted-foreground">
                Start your first mock interview by uploading a resume and job
                description.
              </p>
              <Button asChild className="mt-4">
                <Link href="/interview/setup">
                  <Plus className="mr-2 h-4 w-4" />
                  Start New Interview
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {interviews.map((interview: Interview) => {
              const config = statusConfig[interview.status];
              const Icon = config.icon;

              return (
                <Card
                  key={interview._id}
                  className="transition-shadow hover:shadow-md"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          Interview Session
                        </CardTitle>
                        <CardDescription>
                          {interview.createdAt
                            ? `${formatDistanceToNow(
                                new Date(interview.createdAt)
                              )} ago`
                            : "Just now"}
                        </CardDescription>
                      </div>

                      <span
                        className={`${config.bg} ${config.color} flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium`}
                      >
                        <Icon className="h-3 w-3" />
                        {config.label}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="line-clamp-1 text-muted-foreground">
                        <strong>Job:</strong>{" "}
                        {interview.jobDescription.slice(0, 80)}...
                      </p>

                      <div className="flex items-center justify-between border-t pt-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/interview/${interview._id}`}>
                            Continue
                          </Link>
                        </Button>

                        <span className="text-xs text-muted-foreground">
                          Q{interview.currentQuestionIndex + 1}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}