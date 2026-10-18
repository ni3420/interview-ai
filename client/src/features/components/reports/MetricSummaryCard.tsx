"use client";

import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/features/components/common/Card";

export interface MetricSummaryCardProps {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  icon: LucideIcon;
  accent?: string;
}

export function MetricSummaryCard({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  accent = "bg-primary/10 text-primary",
}: MetricSummaryCardProps) {
  const hasDelta = typeof delta === "number";
  const isUp = (delta ?? 0) >= 0;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {label}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
          </div>
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        </div>
        {(hasDelta || deltaLabel) && (
          <div className="mt-3 flex items-center gap-2">
            {hasDelta && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  isUp
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                }`}
              >
                {isUp ? (
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="h-3 w-3" aria-hidden="true" />
                )}
                {isUp ? "+" : ""}
                {delta}%
              </span>
            )}
            {deltaLabel && (
              <span className="text-xs text-slate-400">{deltaLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MetricSummaryCard;
