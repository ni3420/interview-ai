import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

const POINTS = [
  {
    term: "Interview room",
    detail: "A voice session with an AI interviewer, driven by the role description.",
  },
  {
    term: "Transcript",
    detail: "Every question and answer captured in order as the session runs.",
  },
  {
    term: "Report",
    detail: "Rubric scores with the quotes behind each one.",
  },
];

export interface AuthShellProps {
  title: string;
  description: string;
  legal: string;
  children: ReactNode;
}

export function AuthShell({ title, description, legal, children }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <main className="flex min-h-screen flex-col px-5 py-6 sm:px-8 lg:min-h-0">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 rounded-md">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted font-mono text-[11px] font-semibold tracking-tight"
            >
              IA
            </span>
            <span className="text-sm font-semibold tracking-tight">Interview AI</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to site
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">
            <h1 className="text-title font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-caption text-muted-foreground">{description}</p>
            <div className="mt-6">{children}</div>
            <p className="mt-5 text-micro text-muted-foreground">{legal}</p>
          </div>
        </div>
      </main>

      <aside className="hidden border-l border-border bg-card p-10 lg:flex lg:flex-col lg:justify-between">
        <p className="text-micro font-medium uppercase text-muted-foreground">
          Interview AI
        </p>
        <div>
          <p className="text-heading font-semibold tracking-tight">
            Structured voice interviews, turned into reports you can check.
          </p>
          <dl className="mt-8 space-y-5 border-t border-border pt-6">
            {POINTS.map((point) => (
              <div key={point.term}>
                <dt className="text-caption font-medium">{point.term}</dt>
                <dd className="mt-0.5 text-micro leading-relaxed text-muted-foreground">
                  {point.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-micro text-muted-foreground">
          Sign-in is handled by Clerk. Your session stays on this device.
        </p>
      </aside>
    </div>
  );
}
