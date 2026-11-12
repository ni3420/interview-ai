"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeStatus = "success" | "warning" | "info" | "neutral";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
  dot?: boolean;
}

const statusStyles: Record<BadgeStatus, string> = {
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  info: "bg-info/10 text-info ring-info/25",
  neutral: "bg-muted text-muted-foreground ring-border",
};

const dotStyles: Record<BadgeStatus, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

export function Badge({
  className,
  status = "neutral",
  dot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        statusStyles[status],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dotStyles[status])}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

export default Badge;
