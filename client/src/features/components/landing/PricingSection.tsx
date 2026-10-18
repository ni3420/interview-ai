"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/features/components/common/Button";
import { Card, CardContent } from "@/features/components/common/Card";
import { Toggle } from "@/features/components/common/Toggle";

interface Plan {
  name: string;
  description: string;
  monthly: number;
  yearly: number;
  highlight?: boolean;
  cta: string;
  href: string;
  features: string[];
}

const plans: Plan[] = [
  {
    name: "Starter",
    description: "For getting a feel for AI interviews.",
    monthly: 0,
    yearly: 0,
    cta: "Start free",
    href: "/sign-up",
    features: ["3 mock interviews / month", "Resume analysis", "Basic feedback report"],
  },
  {
    name: "Pro",
    description: "For candidates actively preparing.",
    monthly: 19,
    yearly: 15,
    highlight: true,
    cta: "Go Pro",
    href: "/sign-up",
    features: [
      "Unlimited mock interviews",
      "Adaptive follow-up questions",
      "Detailed analytics & exports",
      "Priority AI model access",
    ],
  },
  {
    name: "Team",
    description: "For bootcamps and hiring teams.",
    monthly: 49,
    yearly: 39,
    cta: "Talk to sales",
    href: "/sign-up",
    features: [
      "Everything in Pro",
      "Shared candidate workspace",
      "Role-based access",
      "Dedicated support",
    ],
  },
];

export function PricingSection() {
  const [yearly, setYearly] = React.useState(false);

  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="mt-3 text-slate-600 dark:text-slate-400">
            Start free. Upgrade when you&apos;re ready to go all in.
          </p>

          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
            <span
              className={cn(
                "text-sm",
                !yearly ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-400"
              )}
            >
              Monthly
            </span>
            <Toggle
              checked={yearly}
              onCheckedChange={setYearly}
              label="Toggle yearly billing"
            />
            <span
              className={cn(
                "text-sm",
                yearly ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-400"
              )}
            >
              Yearly
              <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                -20%
              </span>
            </span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const price = yearly ? plan.yearly : plan.monthly;
            return (
              <Card
                key={plan.name}
                interactive
                className={cn(
                  "relative flex h-full flex-col",
                  plan.highlight && "border-primary shadow-lg ring-1 ring-primary/20"
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    Most popular
                  </span>
                )}
                <CardContent className="flex flex-1 flex-col p-6">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {plan.description}
                  </p>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">
                      ${price}
                    </span>
                    <span className="text-sm text-slate-400">/month</span>
                  </div>
                  {yearly && plan.monthly > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      Billed ${plan.yearly * 12} annually
                    </p>
                  )}

                  <ul className="mt-6 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                          aria-hidden="true"
                        />
                        <span className="text-slate-600 dark:text-slate-300">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className="mt-6 w-full"
                    variant={plan.highlight ? "primary" : "outline"}
                  >
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default PricingSection;
