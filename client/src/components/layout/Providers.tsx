"use client";

import { ReactNode } from "react";
import { ConvexClientProvider } from "./ConvexClientProvider";
import { ClerkClientProvider } from "./ClerkClientProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ToasterComponent } from "./ToasterComponent";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkClientProvider>
      <ConvexClientProvider>
        <ThemeProvider>
          {children}
          <ToasterComponent />
        </ThemeProvider>
      </ConvexClientProvider>
    </ClerkClientProvider>
  );
}