import Link from "next/link";
import { Check } from "lucide-react";

const INCLUDED = [
  "Unlimited mock interviews during early access",
  "Questions generated from your resume and the role",
  "Live voice session with an AI interviewer",
  "Transcript, rubric scores and the quote behind each score",
  "Report exports from the reports page",
];

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-20 border-b border-border py-14 lg:py-16">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-signal">
            Access
          </p>
          <h2 className="mt-4 max-w-[16ch] font-display text-[30px] font-medium leading-[1.02] tracking-[-0.018em] text-foreground sm:text-[40px]">
            Free while it is early.
          </h2>
          <p className="mt-4 max-w-[52ch] text-[13.5px] leading-[1.6] text-muted-foreground">
            There are no paid plans on sale. Checkout is not connected, so nothing
            on this page can charge you. When billing exists, it will be announced
            here rather than implied by a price.
          </p>

          <ul className="mt-8 max-w-[52ch] border-t border-border">
            {INCLUDED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 border-b border-border py-2.5 text-[13.5px] text-foreground"
              >
                <Check
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-evidence"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-5 lg:pl-8">
          <div className="border-t-2 border-foreground pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Early access
            </p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-[40px] font-medium leading-none tracking-[-0.03em] tabular-nums text-foreground">
                $0
              </span>
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                per session
              </span>
            </p>
            <Link
              href="/sign-up"
              className="mt-6 flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-[var(--primary-hover)]"
            >
              Start a mock interview
            </Link>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              No card. No trial clock. A session lasts as long as the length you
              choose.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PricingSection;
