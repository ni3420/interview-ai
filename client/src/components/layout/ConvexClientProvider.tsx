"use client";

import { convex } from "@/lib/convex";
import { ReactNode } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

// `convex/react-clerk` (1.4x) types `ConvexProviderWithClerk.useAuth` against
// Clerk v6's `useAuth` shape, while this project uses Clerk v5. The runtime
// contract is compatible, so we bridge the two type definitions here.
type ClerkUseAuth = Parameters<typeof ConvexProviderWithClerk>[0]["useAuth"];

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk
      useAuth={useAuth as unknown as ClerkUseAuth}
      client={convex}
    >
      {children}
    </ConvexProviderWithClerk>
  );
}