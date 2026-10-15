"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Loader2, Sparkles, FileText, Brain } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ResumeUpload } from "@/features/interview/ResumeUpload";
import { JobDescriptionInput } from "@/features/interview/JobDescriptionInput";
import { interviewSetupSchema } from "@/features/interview/validation";
import { toast } from "sonner";

interface UploadedResume {
  resumeId: string;
  fileName: string;
}

export default function InterviewSetupPage() {
  const router = useRouter();
  const createInterview = useMutation(api.interviews.createInterview);

  const [resume, setResume] = useState<UploadedResume | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [errors, setErrors] = useState<{
    resumeId?: string;
    jobDescription?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = interviewSetupSchema.safeParse({
      resumeId: resume?.resumeId ?? "",
      jobDescription,
    });

    if (!result.success) {
      const newErrors: typeof errors = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === "resumeId") newErrors.resumeId = err.message;
        if (err.path[0] === "jobDescription")
          newErrors.jobDescription = err.message;
      });
      setErrors(newErrors);
      return;
    }

    if (!resume) return;
    setErrors({});

    setIsSubmitting(true);
    try {
      const interviewId = await createInterview({
        resumeId: resume.resumeId,
        jobDescription,
      });
      toast.success("Interview created!");
      router.push(`/interview/${interviewId}/lobby`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to create interview. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            Set Up Interview
          </h1>
          <p className="mt-2 text-muted-foreground">
            Upload your resume and paste the job description to prepare a
            personalized mock interview
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <ResumeUpload
          onResumeUploaded={setResume}
          onResumeRemoved={() => setResume(null)}
          isProcessing={isSubmitting}
        />

        <JobDescriptionInput
          value={jobDescription}
          onChange={setJobDescription}
          error={errors.jobDescription}
        />

        {errors.resumeId && (
          <div className="text-sm text-destructive" role="alert">
            {errors.resumeId}
          </div>
        )}

        <div className="flex gap-4 pt-4">
          <Button
            type="submit"
            className="flex-1"
            size="lg"
            disabled={isSubmitting || !resume || jobDescription.length < 50}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Interview...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Start Mock Interview
              </>
            )}
          </Button>
        </div>
      </form>

      <Card className="mt-8 border-muted/50">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3 text-center">
            <div className="p-4">
              <Sparkles className="mx-auto h-8 w-8 text-primary mb-2" />
              <h3 className="font-medium">AI-Generated Questions</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Personalized from your resume &amp; JD
              </p>
            </div>
            <div className="p-4">
              <FileText className="mx-auto h-8 w-8 text-primary mb-2" />
              <h3 className="font-medium">Adaptive Follow-ups</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Questions adapt to your answers
              </p>
            </div>
            <div className="p-4">
              <Brain className="mx-auto h-8 w-8 text-primary mb-2" />
              <h3 className="font-medium">Detailed Report</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Scores, strengths &amp; improvements
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
