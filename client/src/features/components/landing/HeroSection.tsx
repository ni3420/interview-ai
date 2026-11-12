"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const WAVEFORM = [
  18, 30, 44, 26, 56, 38, 22, 48, 62, 34, 20, 42, 58, 30, 16, 36, 50, 24, 40,
  28, 14, 32, 46, 20, 34, 52, 26, 18, 38, 22,
];

const RAIL = [
  { label: "Resume", lines: [96, 84, 90, 62] },
  { label: "Role", lines: [88, 94, 72, 58] },
];

function ProductEvidence() {
  return (
    <figure className="lg:col-span-5 lg:col-start-8">
      <div className="rounded-[10px] border border-border bg-card p-2">
        <div className="flex items-center justify-between gap-3 border-b border-border px-2 py-2">
          <span className="font-mono text-[10.5px] font-semibold tracking-tight text-muted-foreground">
            interview / session-042
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-signal">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-signal" />
            Live
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,34%)_minmax(0,1fr)]">
          <div className="border-r border-border p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Source
            </p>
            {RAIL.map((item) => (
              <div key={item.label} className="mt-3">
                <p className="font-mono text-[10.5px] font-semibold text-foreground">
                  {item.label}
                </p>
                <div className="mt-1.5 space-y-1" aria-hidden="true">
                  {item.lines.map((width, index) => (
                    <span
                      key={index}
                      className="block h-1 rounded-[2px] bg-muted"
                      style={{ width: `${width}%` }}
                    />
                  ))}
                </div>
              </div>
            ))}
            <p className="mt-4 border-t border-border pt-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
              2 of 6
              <br />
              questions
            </p>
          </div>

          <div className="flex flex-col justify-between p-4">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Question
              </p>
              <p className="mt-2 text-[15px] font-medium leading-snug text-foreground">
                You shipped a design system across three teams. What broke first,
                and what did you change?
              </p>
            </div>

            <div className="mt-6">
              <div
                className="flex h-14 items-center gap-[3px]"
                aria-hidden="true"
              >
                {WAVEFORM.map((height, index) => (
                  <span
                    key={index}
                    className="w-[3px] flex-1 rounded-[2px] bg-signal/70"
                    style={{ height: `${height}px` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  00:41
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  Listening
                </span>
                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  00:52
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Sample session. Questions are generated from the resume and the role you
        paste in.
      </figcaption>
    </figure>
  );
}

export interface HeroSectionProps {
  ctaHref?: string;
}

export function HeroSection({ ctaHref = "/sign-up" }: HeroSectionProps) {
  return (
    <section className="border-b border-border pb-14 pt-14 lg:pb-20 lg:pt-18">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-signal">
            AI voice interview practice
          </p>

          <h1 className="mt-5 font-display text-[42px] font-medium leading-[0.98] tracking-[-0.025em] text-foreground sm:text-[52px] lg:text-[64px]">
            Rehearse the interview you&apos;re actually going to have.
          </h1>

          <p className="mt-6 max-w-[46ch] text-[17px] leading-[1.55] text-muted-foreground">
            Upload a resume and the job description. The interviewer asks 5&ndash;7
            questions by voice, follows up on thin answers, then writes a report
            with the quote behind every score.
          </p>

          <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Link
              href={ctaHref}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-[var(--primary-hover)]"
            >
              Start a mock interview
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              Sign in
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>

          <dl className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-[11px]">
            {[
              ["Questions", "5–7 per session"],
              ["Default length", "30 minutes"],
              ["Report", "Scored with quotes"],
            ].map(([term, value], index) => (
              <div key={term} className="flex items-center gap-4">
                {index > 0 && (
                  <span aria-hidden="true" className="h-3 w-px bg-border" />
                )}
                <div>
                  <dt className="sr-only">{term}</dt>
                  <dd className="font-medium text-muted-foreground">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <ProductEvidence />
      </div>
    </section>
  );
}

export default HeroSection;
