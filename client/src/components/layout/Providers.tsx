"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ClerkClientProvider } from "./ClerkClientProvider";
import UserSyncProvider from "./UserSyncProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ToasterComponent } from "./ToasterComponent";

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The Playwright harness must render without Clerk or Convex credentials.
  // Scoped to /e2e/ and inlined from the build-time flag.
  const isE2EHarness =
    process.env.NEXT_PUBLIC_E2E_HARNESS === "1" &&
    pathname.startsWith("/e2e/");

  const themed = (
    <ThemeProvider>
      {children}
      <ToasterComponent />
    </ThemeProvider>
  );

  if (isE2EHarness) return themed;

  return (
    <ClerkClientProvider>
      <ConvexClientProvider>
        <ThemeProvider>
          <UserSyncProvider>{children}</UserSyncProvider>
          <ToasterComponent />
        </ThemeProvider>
      </ConvexClientProvider>
    </ClerkClientProvider>
  );
}
