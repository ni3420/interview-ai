"use client";

import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

/**
 * Shell-shaped placeholder used while Clerk has not finished loading on a
 * protected route, so the first paint already matches the app chrome.
 */
export function AppBootSkeleton() {
  return (
    <div className="flex h-screen bg-background">
      <aside
        aria-hidden="true"
        className="hidden w-64 shrink-0 flex-col border-r border-border lg:flex"
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-3">
          <div className="h-8 w-8 rounded-md bg-muted" />
          <Bar className="h-3.5 w-28" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          {[0, 1, 2].map((index) => (
            <Bar key={index} className="h-9 w-full" />
          ))}
        </div>
        <div className="mt-auto border-t border-border p-3">
          <div className="flex items-center gap-2.5 p-1.5">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="space-y-1.5">
              <Bar className="h-3 w-24" />
              <Bar className="h-2.5 w-32" />
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 sm:px-6">
          <Bar className="h-4 w-36" />
          <div className="flex items-center gap-2">
            <Bar className="h-8 w-8 rounded-md" />
            <Bar className="h-8 w-8 rounded-full" />
          </div>
        </div>
        <ContentSkeleton />
      </div>

      <span role="status" className="sr-only">
        Loading workspace
      </span>
    </div>
  );
}

/** Content-only placeholder for Suspense boundaries inside the app shell. */
export function ContentSkeleton() {
  return (
    <div aria-hidden="true" className="flex-1 overflow-hidden p-4 sm:p-6">
      <div className="space-y-6">
        <div className="space-y-2.5">
          <Bar className="h-6 w-56" />
          <Bar className="h-3 w-80 max-w-full" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="rounded-lg border border-border bg-card p-4"
            >
              <Bar className="h-3 w-20" />
              <Bar className="mt-3 h-7 w-16" />
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <Bar className="h-4 w-36" />
          </div>
          <div className="divide-y divide-border">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="flex items-center gap-4 p-4">
                <Bar className="h-4 w-1/3" />
                <Bar className="h-4 w-20" />
                <div className="ml-auto">
                  <Bar className="h-4 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
