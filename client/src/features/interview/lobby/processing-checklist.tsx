import { CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ResumeStatus = "uploaded" | "processing" | "ready" | "failed";

type StepState = "done" | "active" | "pending" | "error";

export interface ProcessingStep {
  label: string;
  description: string;
  state: StepState;
}

/**
 * Maps resume-processing status onto the steps shown in the interview lobby.
 * Text extraction, embeddings and question generation land in a later stage, so
 * anything past "resume received" stays pending until the status becomes ready.
 */
export function getProcessingSteps(status?: ResumeStatus): ProcessingStep[] {
  const received: StepState = status ? "done" : "pending";
  const processing: StepState =
    status === "ready"
      ? "done"
      : status === "failed"
        ? "error"
        : status === "processing"
          ? "active"
          : "pending";
  const questions: StepState = status === "ready" ? "done" : "pending";
  const ready: StepState = status === "ready" ? "done" : "pending";

  return [
    {
      label: "Resume received",
      description: status ? "Your PDF is stored securely." : "Upload a resume to begin.",
      state: received,
    },
    {
      label: "Processing resume",
      description: "Extracting text and building embeddings.",
      state: processing,
    },
    {
      label: "Generating questions",
      description: "Tailoring questions to your resume and the role.",
      state: questions,
    },
    {
      label: "Ready to join",
      description: "Your AI interviewer is prepared.",
      state: ready,
    },
  ];
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "done")
    return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (state === "active")
    return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  if (state === "error")
    return <AlertCircle className="h-5 w-5 text-destructive" />;
  return <Circle className="h-5 w-5 text-muted-foreground/50" />;
}

export function ProcessingChecklist({ status }: { status?: ResumeStatus }) {
  const steps = getProcessingSteps(status);

  return (
    <ol className="space-y-4" aria-label="Interview preparation progress">
      {steps.map((step) => (
        <li key={step.label} className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">
            <StepIcon state={step.state} />
          </span>
          <div>
            <p
              className={cn(
                "text-sm font-medium",
                step.state === "pending" && "text-muted-foreground"
              )}
            >
              {step.label}
            </p>
            <p className="text-xs text-muted-foreground">{step.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
