import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function NotFound() {
  return (
    <main className="landing-editorial flex min-h-screen flex-col bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col">
        <Link href="/" className="flex w-fit items-center gap-3 rounded-md">
          <span aria-hidden="true" className="h-5 w-[3px] bg-signal" />
          <span className="font-display text-[18px] font-medium leading-none tracking-[-0.01em]">
            InterviewAI
          </span>
        </Link>

        <div className="flex flex-1 items-center py-16">
          <div className="w-full max-w-[640px]">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              404 — Not found
            </p>
            <h1 className="mt-5 font-display text-[44px] font-medium leading-[1.03] tracking-[-0.025em] sm:text-[56px]">
              This page is not here.
            </h1>
            <p className="mt-5 max-w-[52ch] text-body leading-relaxed text-muted-foreground">
              The link may be old, or the interview it pointed to was removed. Start
              from the homepage, or sign in to reach your sessions.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-[var(--primary-hover)]"
              >
                Go to the homepage
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex h-10 items-center justify-center rounded-md border border-border px-5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Sign in
              </Link>
            </div>

            <p className="mt-12 border-t border-border pt-4 text-micro leading-relaxed text-muted-foreground">
              No billing is connected, so signing in cannot charge you. No recruiter
              seat sees your transcript.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
