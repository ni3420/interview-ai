"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUserSync } from "./UserSyncProvider";

const SYNC_WAIT_MS = 10_000;

const STEPS = [
  { stage: "clerk", label: "Verify your session" },
  { stage: "identity", label: "Confirm your profile" },
  { stage: "profile", label: "Load your workspace" },
] as const;

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-5 shadow-xs sm:p-6">
        {children}
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-[11px] font-semibold tracking-tight text-foreground"
    >
      IA
    </span>
  );
}

/**
 * Blocks a protected surface until the server confirms a `users` row for the
 * current identity, so its Convex reads and mutations never run against an
 * account that has not been mirrored yet.
 */
export function RequireSyncedUser({ children }: { children: ReactNode }) {
  const { status, stage, failure, retry } = useUserSync();
  const [stalled, setStalled] = useState(false);

  const isWaiting = status === "loading";
  const [trackedWaiting, setTrackedWaiting] = useState(isWaiting);
  if (trackedWaiting !== isWaiting) {
    setTrackedWaiting(isWaiting);
    if (isWaiting) setStalled(false);
  }

  // A wait with no end looks like a working page, so name it (D19).
  useEffect(() => {
    if (!isWaiting) return;
    const timer = setTimeout(() => setStalled(true), SYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [isWaiting]);

  if (status === "synced") return <>{children}</>;

  const retryNow = () => {
    setStalled(false);
    retry();
  };

  if (status === "error") {
    // A taken address is on its way to the sign-up page, so this state names the
    // reason without offering a Retry that would re-run the same rejection.
    const emailTaken = failure === "email_taken";
    return (
      <Panel>
        <div role="alert" className="flex flex-col">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 text-destructive">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="mt-4 text-heading font-semibold text-foreground">
            {emailTaken
              ? "This email address is already in use"
              : "Your account could not be prepared"}
          </p>
          <p className="mt-1.5 text-caption text-muted-foreground">
            {emailTaken
              ? "Only one account can use an email address. Taking you to sign up — use a different address, or sign in with the account that already owns this one."
              : "The interview backend did not confirm your profile. Check your connection, then retry before starting or opening an interview."}
          </p>
          <div className="mt-4">
            {emailTaken ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/sign-up">Go to sign up</Link>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={retryNow}>
                <RefreshCw aria-hidden="true" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </Panel>
    );
  }

  if (status === "signed_out") {
    return (
      <Panel>
        <div role="status" aria-live="polite" className="flex flex-col">
          <Wordmark />
          <p className="mt-4 text-heading font-semibold text-foreground">
            Redirecting you to sign in
          </p>
          <p className="mt-1.5 text-caption text-muted-foreground">
            This page needs an account. If nothing happens, continue manually.
          </p>
          <div className="mt-4">
            <Button asChild variant="outline" size="sm">
              <Link href="/sign-in">Go to sign in</Link>
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  const currentIndex = STEPS.findIndex((step) => step.stage === stage);

  return (
    <Panel>
      <div role="status" aria-live="polite" aria-busy="true">
        <div className="flex items-center gap-3">
          <Wordmark />
          <div className="min-w-0">
            <p className="text-label font-semibold text-foreground">
              Preparing your workspace
            </p>
            <p className="text-caption text-muted-foreground">
              This takes a moment on first sign-in.
            </p>
          </div>
        </div>

        <ol className="mt-5 space-y-3">
          {STEPS.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            return (
              <li key={step.stage} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                    done
                      ? "border-success/30 bg-success/10 text-success"
                      : active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                  )}
                >
                  {done ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : active ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span
                  className={cn(
                    "text-caption",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
                <span className="ml-auto text-micro font-medium uppercase text-muted-foreground">
                  {done ? "Done" : active ? "Working" : "Waiting"}
                </span>
              </li>
            );
          })}
        </ol>

        {stalled && (
          <div className="mt-5 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-caption font-medium text-foreground">
              Still preparing your account
            </p>
            <p className="mt-0.5 text-micro text-muted-foreground">
              The backend has not confirmed your profile yet. Retrying is safe.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2.5"
              onClick={retryNow}
            >
              <RefreshCw aria-hidden="true" />
              Retry
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

export default RequireSyncedUser;
