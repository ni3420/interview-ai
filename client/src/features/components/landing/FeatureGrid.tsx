"use client";

import {
  Blocks,
  BrainCircuit,
  Clock4,
  FileSearch,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/features/components/common/Card";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: Blocks,
    title: "100+ integrations",
    description:
      "Connect your resume sources, calendars and notes so every prep session starts with full context.",
  },
  {
    icon: Clock4,
    title: "Time tracking",
    description:
      "See exactly how long you spend on each answer and track your improvement over time.",
  },
  {
    icon: BrainCircuit,
    title: "Smart reminders",
    description:
      "Adaptive follow-up prompts keep you on track with timely nudges to practise before the real thing.",
  },
];

const secondary: Feature[] = [
  {
    icon: FileSearch,
    title: "Resume-aware questions",
    description: "Every question is grounded in your experience and the role.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    description: "Your resumes and transcripts stay scoped to your account.",
  },
  {
    icon: Sparkles,
    title: "Instant feedback",
    description: "Get structured scores and STAR-aligned suggestions.",
  },
];

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <Card interactive className="h-full">
      <CardContent className="p-6">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="text-base font-semibold">{feature.title}</h3>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          {feature.description}
        </p>
      </CardContent>
    </Card>
  );
}

export function FeatureGrid() {
  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Everything you need to prepare
          </h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            A complete practice loop: analyse, rehearse, and improve.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {secondary.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeatureGrid;
