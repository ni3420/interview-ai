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
import { generateInterviewPlan } from "@/lib/ai-service";

export default function InterviewSetupPage() {
  const router = useRouter();
  const createInterview = useMutation(api.interviews.createInterview);
  const savePlan = useMutation(api.interviews.saveInterviewPlan);

  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [errors, setErrors] = useState<{ resumeText?: string; jobDescription?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const validateForm = () => {
    const result = interviewSetupSchema.safeParse({ resumeText, jobDescription });
    if (!result.success) {
      const newErrors: typeof errors = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === "resumeText") newErrors.resumeText = err.message;
        if (err.path[0] === "jobDescription") newErrors.jobDescription = err.message;
      });
      setErrors(newErrors);
      return false;
    }
    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const interviewId = await createInterview({ resumeText, jobDescription });
      toast.success("Interview created! Generating personalized questions...");

      setIsGeneratingPlan(true);
      try {
        const plan = await generateInterviewPlan({ resume_text: resumeText, job_description: jobDescription });
        await savePlan({ interviewId, plan });
        toast.success("Interview ready! Starting your session...");
      } catch (aiError) {
        console.error("AI plan generation failed:", aiError);
        toast.error("Failed to generate questions. You can still start the interview.");
      } finally {
        setIsGeneratingPlan(false);
      }

      router.push(`/interview/${interviewId}`);
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
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Set Up Interview</h1>
          <p className="mt-2 text-muted-foreground">
            Upload your resume and paste the job description to generate a personalized mock interview
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <ResumeUpload
          resumeText={resumeText}
          onResumeTextChange={setResumeText}
          isProcessing={isSubmitting}
        />

        <JobDescriptionInput
          value={jobDescription}
          onChange={setJobDescription}
          error={errors.jobDescription}
        />

        {errors.resumeText && (
          <div className="text-sm text-destructive flex items-center gap-1" role="alert">
            <span>{errors.resumeText}</span>
          </div>
        )}

        <div className="flex gap-4 pt-4">
          <Button
            type="submit"
            className="flex-1"
            size="lg"
            disabled={isSubmitting || isGeneratingPlan || !resumeText || jobDescription.length < 50}
          >
            {isGeneratingPlan ? (
              <>
                <Brain className="mr-2 h-4 w-4 animate-pulse" />
                Generating Questions...
              </>
            ) : isSubmitting ? (
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
              <p className="text-sm text-muted-foreground mt-1">Personalized from your resume & JD</p>
            </div>
            <div className="p-4">
              <FileText className="mx-auto h-8 w-8 text-primary mb-2" />
              <h3 className="font-medium">Adaptive Follow-ups</h3>
              <p className="text-sm text-muted-foreground mt-1">Questions adapt to your answers</p>
            </div>
            <div className="p-4">
              <ArrowLeft className="mx-auto h-8 w-8 text-primary mb-2" />
              <h3 className="font-medium">Detailed Report</h3>
              <p className="text-sm text-muted-foreground mt-1">Scores, strengths & improvements</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}