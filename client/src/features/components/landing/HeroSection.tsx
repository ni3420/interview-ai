"use client";

import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  FileText,
  Pin,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/features/components/common/Button";
import { Badge } from "@/features/components/common/Badge";
import { Card, CardContent } from "@/features/components/common/Card";

function FloatingNote() {
  return (
    <div className="absolute left-2 top-8 z-10 hidden w-64 -rotate-3 transition-transform hover:rotate-0 xl:left-8 xl:top-12 xl:block">
      <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 shadow-lg backdrop-blur-sm dark:border-amber-500/30 dark:bg-amber-950/40">
        <div className="mb-2 flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <Pin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Pro tip
          </span>
        </div>
        <p className="text-xs leading-relaxed text-amber-900/90 dark:text-amber-100/90">
          Take notes and get real-time STAR method feedback on every response.
        </p>
      </div>
    </div>
  );
}

function FloatingSchedule() {
  return (
    <div className="absolute right-2 top-8 z-10 hidden w-64 rotate-2 transition-transform hover:rotate-0 xl:right-8 xl:top-10 xl:block">
      <Card className="border-slate-200/80 bg-white/90 shadow-lg backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/90">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <CalendarClock className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              Upcoming Session
            </span>
            <Badge status="info" dot>
              Live
            </Badge>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
            Senior Frontend AI Interview
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Today · 15:00 min</p>
        </CardContent>
      </Card>
    </div>
  );
}

function FloatingScore() {
  return (
    <div className="absolute bottom-6 left-2 z-10 hidden w-64 rotate-2 transition-transform hover:rotate-0 xl:bottom-10 xl:left-6 xl:block">
      <Card className="border-slate-200/80 bg-white/90 shadow-lg backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/90">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Confidence score
            </span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              92%
            </span>
          </div>
          <div
            className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
            role="progressbar"
            aria-valuenow={92}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full w-[92%] rounded-full bg-emerald-500 transition-all duration-500" />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <TrendingUp className="h-3 w-3 shrink-0 text-emerald-500" aria-hidden="true" />
            Technical accuracy up 12% this week
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FloatingMatching() {
  return (
    <div className="absolute bottom-6 right-2 z-10 hidden w-64 -rotate-2 transition-transform hover:rotate-0 xl:bottom-8 xl:right-6 xl:block">
      <Card className="border-slate-200/80 bg-white/90 shadow-lg backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/90">
        <CardContent className="p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BrainCircuit className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                RAG-Powered Match
              </span>
            </div>
            <Badge status="success">98% Fit</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <FileText className="h-3 w-3 text-slate-400" aria-hidden="true" />
              Resume
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <FileText className="h-3 w-3 text-slate-400" aria-hidden="true" />
              Job Spec
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export interface HeroSectionProps {
  ctaHref?: string;
}

export function HeroSection({ ctaHref = "/sign-up" }: HeroSectionProps) {
  return (
    <section className="relative flex min-h-[580px] w-full items-center justify-center overflow-hidden rounded-3xl py-16 lg:py-24">
      {/* Background Radial Glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_40%,rgba(139,92,246,0.15),transparent_100%)] dark:bg-[radial-gradient(50%_50%_at_50%_40%,rgba(124,58,237,0.25),transparent_100%)]"
        aria-hidden="true"
      />

      {/* Hero Central Content Container */}
      <div className="relative z-20 mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <div className="mb-6 flex justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <Sparkles className="h-7 w-7 text-primary" aria-hidden="true" />
          </span>
        </div>

        <h1 className="text-balance text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-6xl">
          Practice, prep, and ace your AI interviews
          <span className="block text-primary sm:inline"> all in one place</span>
        </h1>

        <p className="mt-6 max-w-xl text-base text-slate-600 dark:text-slate-300 sm:text-lg">
          Upload job descriptions, match your resume, and experience realistic AI
          mock interviews with instant, actionable feedback.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Button asChild size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
            <Link href={ctaHref}>Start Free Mock Interview</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </div>

        <p className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-slate-400">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          No credit card required
        </p>
      </div>

      {/* Floating UI Elements */}
      <FloatingNote />
      <FloatingSchedule />
      <FloatingScore />
      <FloatingMatching />
    </section>
  );
}

export default HeroSection;