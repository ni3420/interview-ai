"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserSync } from "./UserSyncProvider";

const SYNC_WAIT_MS = 10_000;

/**
 * Blocks a protected surface until the server confirms a `users` row for the
 * current identity, so its Convex reads and mutations never run against an
 * account that has not been mirrored yet.
 */
export function RequireSyncedUser({ children }: { children: ReactNode }) {
  const { status, retry } = useUserSync();
  const [stalled, setStalled] = useState(false);

  // A wait with no end looks like a working page, so name it (D19).
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setStalled(true), SYNC_WAIT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  if (status === "synced") return <>{children}</>;

  if (status === "error" || stalled) {
    return (
      <div
        role="alert"
        className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center"
      >
        <p className="text-sm font-medium text-foreground">
          Your account could not be prepared
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          The interview backend did not confirm your profile. Check your
          connection and retry before starting or opening an interview.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1 gap-2"
          onClick={retry}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">
        {status === "signed_out"
          ? "Redirecting you to sign in..."
          : "Preparing your account for this session..."}
      </p>
    </div>
  );
}

export default RequireSyncedUser;
