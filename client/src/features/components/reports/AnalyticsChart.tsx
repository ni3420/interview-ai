"use client";

export interface ChartPoint {
  label: string;
  value: number;
}

export interface AnalyticsChartProps {
  data: ChartPoint[];
  title?: string;
  description?: string;
  emptyLabel?: string;
}

const WIDTH = 640;
const HEIGHT = 260;
const PADDING = { top: 16, right: 16, bottom: 36, left: 36 };

export function AnalyticsChart({
  data,
  title = "Score trend",
  description = "Interview scores over time",
  emptyLabel = "Not enough data yet.",
}: AnalyticsChartProps) {
  const max = Math.max(1, ...data.map((point) => point.value));
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const count = Math.max(1, data.length);
  const slot = innerWidth / count;
  const barWidth = Math.min(40, slot * 0.5);
  const gridLines = 4;

  return (
    <section className="border-t border-border pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl leading-none tracking-tight text-foreground">
          {title}
        </h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {description}
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <figure className="mt-4">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-64 w-full"
            role="img"
            aria-label={`${title}: ${data
              .map((point) => `${point.label} ${point.value}`)
              .join(", ")}`}
          >
            {Array.from({ length: gridLines + 1 }).map((_, index) => {
              const y = PADDING.top + (innerHeight / gridLines) * index;
              const value = Math.round(max - (max / gridLines) * index);
              return (
                <g key={index}>
                  <line
                    x1={PADDING.left}
                    x2={WIDTH - PADDING.right}
                    y1={y}
                    y2={y}
                    className="stroke-border"
                    strokeWidth={1}
                  />
                  <text
                    x={PADDING.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-muted-foreground font-mono text-[10px]"
                  >
                    {value}
                  </text>
                </g>
              );
            })}

            {data.map((point, index) => {
              const height = (point.value / max) * innerHeight;
              const x = PADDING.left + slot * index + (slot - barWidth) / 2;
              const y = PADDING.top + (innerHeight - height);
              return (
                <g key={`${point.label}-${index}`}>
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(2, height)}
                    rx={1}
                    className="fill-signal/80"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={HEIGHT - PADDING.bottom + 20}
                    textAnchor="middle"
                    className="fill-muted-foreground font-mono text-[10px]"
                  >
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </figure>
      )}
    </section>
  );
}

export default AnalyticsChart;
