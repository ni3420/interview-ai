"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";

type SyncStatus = "loading" | "synced" | "error";

const UserSyncContext = createContext<SyncStatus>("loading");

export function useUserSync() {
  return useContext(UserSyncContext);
}

export default function UserSyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, isLoaded, isSignedIn } = useUser();
  const syncUser = useMutation(api.users.syncUser);
  const [status, setStatus] = useState<SyncStatus>("loading");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    // 1. Jab tak Clerk fully load nahi hota, tab tak kuch mat karo (redirect bhi mat karo)
    if (!isLoaded) return;

    // 2. Agar Clerk load ho chuka hai, tab check karo ki sach mein user signed out hai kya
    if (!isSignedIn || !user) {
      setStatus("error");
      router.push("/sign-in");
      return;
    }

    setStatus("loading");

    syncUser({
      clerkId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      name: user.fullName ?? undefined,
      imageUrl: user.imageUrl ?? undefined,
    })
      .then(() => {
        if (!cancelled) setStatus("synced");
      })
      .catch((error) => {
        console.error("User sync failed:", error);
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user, syncUser, router]);

  // 3. Jab tak Clerk load ho raha hai, tab tak blank ya loading state dikhao taaki error flash na ho
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <UserSyncContext.Provider value={status}>
      {children}
    </UserSyncContext.Provider>
  );
}