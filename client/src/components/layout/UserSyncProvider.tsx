"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, usePathname } from "next/navigation";
import { AppBootSkeleton } from "./AppBootSkeleton";

type SyncStatus = "loading" | "synced" | "signed_out" | "error";

/** The part of the handshake currently in flight, so the UI can name it. */
type SyncStage = "clerk" | "identity" | "profile";

/** Why the sync failed, so a degraded state can name its real cause (D19). */
type SyncFailure = "email_taken" | "sync_failed";

/**
 * Where a refused address is sent, and the query the page reads to explain it.
 * Mirrors `EMAIL_ALREADY_LINKED` in `convex/auth.ts`; server code cannot be
 * imported into the browser bundle.
 */
export const EMAIL_ALREADY_LINKED = "EMAIL_ALREADY_LINKED";
export const EMAIL_IN_USE_TARGET = "/sign-up?reason=email-taken";

interface UserSyncState {
  status: SyncStatus;
  stage: SyncStage;
  failure: SyncFailure | null;
  retry: () => void;
}

const UserSyncContext = createContext<UserSyncState>({
  status: "loading",
  stage: "clerk",
  failure: null,
  retry: () => {},
});

export function useUserSync() {
  return useContext(UserSyncContext);
}

export default function UserSyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isLoaded, isSignedIn, user } = useUser();
  const syncUser = useMutation(api.users.syncUser);
  const [failure, setFailure] = useState<SyncFailure | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Primitives, not the Clerk user object: its identity churns between renders
  // and would re-fire the sync mutation.
  const email = user?.primaryEmailAddress?.emailAddress;
  const name = user?.fullName ?? undefined;
  const imageUrl = user?.imageUrl;
  const profileKey = [email, name, imageUrl].map((value) => value ?? "").join("|");
  const pushedProfile = useRef<string | null>(null);

  // The backend answers whether its `users` row exists. A resolved mutation
  // promise is not proof: the row is only real once Convex has mirrored the
  // identity it verified itself.
  const syncState = useQuery(
    api.users.getSyncStatus,
    isLoaded && isSignedIn ? {} : "skip"
  ) as "anonymous" | "unsynced" | "synced" | undefined;

  const runSync = useCallback(() => {
    pushedProfile.current = profileKey;
    syncUser({ email, name, imageUrl }).catch((error: unknown) => {
      console.error("User sync failed:", error);
      setFailure(
        String((error as Error)?.message ?? error).includes(EMAIL_ALREADY_LINKED)
          ? "email_taken"
          : "sync_failed"
      );
    });
  }, [syncUser, email, name, imageUrl, profileKey]);

  const retry = useCallback(() => {
    setFailure(null);
    runSync();
  }, [runSync]);

  // `"anonymous"` is the window where Clerk finished loading but its token has
  // not reached Convex, so this waits for the query to flip rather than firing a
  // mutation that would be rejected. Once the identity has landed, the profile
  // is pushed once per distinct Clerk profile — including over an existing row,
  // so a row created before sync carried a profile gets its name, email and
  // image backfilled.
  const identityHasLanded = syncState === "unsynced" || syncState === "synced";

  // Only the application surfaces require a signed-in session. Everything else
  // — marketing, auth, and the 404 page — stays readable while signed out.
  const isAppRoute = ["/dashboard", "/interview", "/reports", "/admin"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    if (!isLoaded || isSignedIn || !isAppRoute) return;
    router.push("/sign-in");
  }, [isLoaded, isSignedIn, isAppRoute, router]);

  // A taken address is not a transient failure — retrying cannot free it — so
  // leave the protected surface and explain it on the page that can act.
  const sentToSignUp = useRef(false);
  useEffect(() => {
    if (failure !== "email_taken" || sentToSignUp.current) return;
    sentToSignUp.current = true;
    router.replace(EMAIL_IN_USE_TARGET);
  }, [failure, router]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!identityHasLanded) return;
    if (pushedProfile.current === profileKey) return;
    runSync();
  }, [isLoaded, isSignedIn, identityHasLanded, profileKey, runSync]);

  let status: SyncStatus;
  if (!isLoaded) status = "loading";
  else if (!isSignedIn) status = "signed_out";
  else if (syncState === "synced") status = "synced";
  else if (syncState === "unsynced" && failure) status = "error";
  else status = "loading";

  const stage: SyncStage = !isLoaded
    ? "clerk"
    : !identityHasLanded
      ? "identity"
      : "profile";

  const value = useMemo(
    () => ({ status, stage, failure, retry }),
    [status, stage, failure, retry]
  );

  if (!isLoaded) {
    // Marketing, auth, and not-found pages must paint immediately; only
    // protected routes need the shell-shaped boot state while Clerk resolves.
    if (!isAppRoute) {
      return (
        <UserSyncContext.Provider value={value}>
          {children}
        </UserSyncContext.Provider>
      );
    }
    return <AppBootSkeleton />;
  }

  return (
    <UserSyncContext.Provider value={value}>
      {children}
    </UserSyncContext.Provider>
  );
}
