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
import { useRouter } from "next/navigation";

type SyncStatus = "loading" | "synced" | "signed_out" | "error";

interface UserSyncState {
  status: SyncStatus;
  retry: () => void;
}

const UserSyncContext = createContext<UserSyncState>({
  status: "loading",
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
  const [syncFailed, setSyncFailed] = useState(false);
  const router = useRouter();

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
    syncUser({ email, name, imageUrl }).catch((error) => {
      console.error("User sync failed:", error);
      setSyncFailed(true);
    });
  }, [syncUser, email, name, imageUrl, profileKey]);

  const retry = useCallback(() => {
    setSyncFailed(false);
    runSync();
  }, [runSync]);

  // `"anonymous"` is the window where Clerk finished loading but its token has
  // not reached Convex, so this waits for the query to flip rather than firing a
  // mutation that would be rejected. Once the identity has landed, the profile
  // is pushed once per distinct Clerk profile — including over an existing row,
  // so a row created before sync carried a profile gets its name, email and
  // image backfilled.
  const identityHasLanded = syncState === "unsynced" || syncState === "synced";

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push("/sign-in");
  }, [isLoaded, isSignedIn, router]);

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
  else if (syncState === "unsynced" && syncFailed) status = "error";
  else status = "loading";

  const value = useMemo(() => ({ status, retry }), [status, retry]);

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <UserSyncContext.Provider value={value}>
      {children}
    </UserSyncContext.Provider>
  );
}
