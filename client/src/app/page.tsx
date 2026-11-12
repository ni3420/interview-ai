"use client";

import Link from "next/link";
import { ThemeToggle } from "@/features/components/common/Toggle";
import { HeroSection } from "@/features/components/landing/HeroSection";
import { FeatureGrid } from "@/features/components/landing/FeatureGrid";
import { ProofBand } from "@/features/components/landing/ProofBand";
import { PricingSection } from "@/features/components/landing/PricingSection";
import { FaqSection } from "@/features/components/landing/FaqSection";

const navLinks = [
  { label: "Capabilities", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export default function Home() {
  return (
    <div className="landing-editorial flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span aria-hidden="true" className="h-5 w-[3px] bg-signal" />
            <span className="font-display text-[19px] font-medium leading-none tracking-[-0.01em]">
              InterviewAI
            </span>
          </Link>

          <nav aria-label="Sections" className="hidden items-center gap-7 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground lg:inline">
              Early access
            </span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-border lg:block" />
            <Link
              href="/sign-in"
              className="hidden text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Sign in
            </Link>
            <ThemeToggle />
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-[var(--primary-hover)]"
            >
              Start
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-8">
          <HeroSection />
          <FeatureGrid />
          <ProofBand />
          <PricingSection />
          <FaqSection />
        </div>

        <section className="border-b border-border">
          <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <h2 className="font-display text-[32px] font-medium leading-[1.02] tracking-[-0.018em] text-foreground sm:text-[42px] lg:col-span-8">
                Run the interview once before it counts.
              </h2>
              <div className="lg:col-span-4 lg:justify-self-end">
                <Link
                  href="/sign-up"
                  className="flex h-10 w-full items-center justify-center rounded-md bg-primary px-5 text-[13px] font-bold text-primary-foreground transition-colors hover:bg-[var(--primary-hover)] sm:w-auto"
                >
                  Start a mock interview
                </Link>
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Free during early access. No card, no recruiter, no audience.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full">
        <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-3 px-5 py-6 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:px-8">
          <p>
            InterviewAI &mdash; AI voice interview practice. &copy;{" "}
            {new Date().getFullYear()}
          </p>
          <div className="flex items-center gap-5">
            <Link href="/sign-in" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/sign-up" className="hover:text-foreground">
              Create an account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
