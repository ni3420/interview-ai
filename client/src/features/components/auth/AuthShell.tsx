import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/features/components/common/Toggle";

const STEPS = [
  {
    index: "01",
    term: "Upload",
    detail: "A resume and the role description you are preparing for.",
  },
  {
    index: "02",
    term: "Check your setup",
    detail: "The lobby tests your microphone and camera before the timer starts.",
  },
  {
    index: "03",
    term: "Sit the interview",
    detail: "15 to 60 minutes by voice, then a report with the quote behind each score.",
  },
];

export interface AuthShellProps {
  title: string;
  description: string;
  legal: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({
  title,
  description,
  legal,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="landing-editorial min-h-screen bg-background text-foreground lg:grid lg:h-screen lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:overflow-hidden">
      <main className="flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:min-h-0 lg:overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 rounded-md">
            <span aria-hidden="true" className="h-5 w-[3px] bg-signal" />
            <span className="font-display text-[18px] font-medium leading-none tracking-[-0.01em]">
              InterviewAI
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-md text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <div className="w-full max-w-[380px]">
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Account
            </p>
            <h1 className="mt-3 font-display text-[34px] font-medium leading-[1.02] tracking-[-0.02em] sm:text-[38px]">
              {title}
            </h1>
            <p className="mt-2 max-w-[38ch] text-caption leading-relaxed text-muted-foreground">
              {description}
            </p>

            <div className="mt-7">{children}</div>

            {footer && (
              <div className="mt-6 border-t border-border pt-4 text-caption text-muted-foreground">
                {footer}
              </div>
            )}

            <div className="mt-6 border-t border-border pt-4">
              <p className="text-micro leading-relaxed text-muted-foreground">{legal}</p>
              <p className="mt-2 text-micro leading-relaxed text-muted-foreground">
                Sign-in is handled by Clerk. Your session stays on this device.
              </p>
            </div>
          </div>
        </div>
      </main>

      <aside
        aria-label="What happens after you sign in"
        className="hidden border-l border-border bg-muted/40 lg:flex lg:flex-col lg:justify-between lg:overflow-y-auto lg:p-12 xl:p-16"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            The session, in order
          </p>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
            Ready when you are
          </span>
        </div>

        <div className="max-w-[520px] py-12">
          <p className="font-display text-[30px] font-medium leading-[1.1] tracking-[-0.018em] xl:text-[36px]">
            A voice interview built from your resume, scored against a rubric you can
            read.
          </p>

          <ol className="mt-10 border-t border-border">
            {STEPS.map((step) => (
              <li key={step.index} className="border-b border-border py-4">
                <div className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="font-mono text-[11px] font-semibold tabular-nums text-signal"
                  >
                    {step.index}
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">
                      {step.term}
                    </p>
                    <p className="mt-0.5 max-w-[44ch] text-[13px] leading-[1.6] text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="max-w-[52ch] border-t border-border pt-4 text-micro leading-relaxed text-muted-foreground">
          No billing is connected, so signing in cannot charge you. No recruiter seat
          sees your transcript.
        </p>
      </aside>
    </div>
  );
}
