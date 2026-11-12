"use client";

export interface MetricSummaryCardProps {
  label: string;
  value: string;
  deltaLabel?: string;
}

export function MetricSummaryCard({
  label,
  value,
  deltaLabel,
}: MetricSummaryCardProps) {
  return (
    <div className="px-1 py-5 sm:px-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-4xl leading-none tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {deltaLabel && (
        <p className="mt-2 text-xs text-muted-foreground">{deltaLabel}</p>
      )}
    </div>
  );
}

export default MetricSummaryCard;
