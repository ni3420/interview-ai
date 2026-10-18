"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/features/components/common/Button";
import { ThemeToggle } from "@/features/components/common/Toggle";
import { HeroSection } from "@/features/components/landing/HeroSection";
import { FeatureGrid } from "@/features/components/landing/FeatureGrid";
import { PricingSection } from "@/features/components/landing/PricingSection";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Solutions", href: "#solutions" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
];

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between bg-white dark:bg-slate-950">
      {/* Background Radial Glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,rgba(139,92,246,0.1),transparent_100%)] dark:bg-[radial-gradient(60%_40%_at_50%_0%,rgba(124,58,237,0.18),transparent_100%)]"
        aria-hidden="true"
      />

      {/* Sticky Centered Header Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              InterviewAI
            </span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Centered Content Container */}
      <main className="flex w-full flex-1 flex-col items-center">
        <div className="w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <HeroSection />

          <div id="features" className="py-16">
            <FeatureGrid />
          </div>

          <div id="solutions" className="sr-only" />
          <div id="how-it-works" className="sr-only" />

          <div id="pricing" className="py-16">
            <PricingSection />
          </div>
        </div>
      </main>

      {/* Centered Footer */}
      <footer className="w-full border-t border-slate-200/80 py-8 dark:border-slate-800/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center px-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>© {new Date().getFullYear()} InterviewAI — AI-powered interview preparation platform</p>
        </div>
      </footer>
    </div>
  );
}