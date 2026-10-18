"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/features/components/common/Card";

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
  title = "Productivity trend",
  description = "Interview activity over time",
  emptyLabel = "Not enough data yet.",
}: AnalyticsChartProps) {
  const max = Math.max(1, ...data.map((point) => point.value));
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const count = Math.max(1, data.length);
  const slot = innerWidth / count;
  const barWidth = Math.min(48, slot * 0.6);
  const gridLines = 4;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-400">
            {emptyLabel}
          </div>
        ) : (
          <figure>
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
                      className="stroke-slate-200 dark:stroke-slate-800"
                      strokeWidth={1}
                    />
                    <text
                      x={PADDING.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px]"
                    >
                      {value}
                    </text>
                  </g>
                );
              })}

              {data.map((point, index) => {
                const height = (point.value / max) * innerHeight;
                const x =
                  PADDING.left + slot * index + (slot - barWidth) / 2;
                const y = PADDING.top + (innerHeight - height);
                return (
                  <g key={`${point.label}-${index}`}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(2, height)}
                      rx={6}
                      className="fill-primary/80"
                    />
                    <text
                      x={x + barWidth / 2}
                      y={HEIGHT - PADDING.bottom + 20}
                      textAnchor="middle"
                      className="fill-slate-400 text-[10px]"
                    >
                      {point.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </figure>
        )}
      </CardContent>
    </Card>
  );
}

export default AnalyticsChart;
