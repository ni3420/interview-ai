"use client";

import { convex } from "@/lib/convex";
import { ReactNode } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProviderWithClerk useAuth={useAuth} client={convex}>{children}</ConvexProviderWithClerk>;
}