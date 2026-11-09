"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Shared Clerk appearance so sign-in and sign-up cannot drift apart.
 * Colors are literal because Clerk writes them into its own CSS variables;
 * the surrounding page still reads from the token layer in globals.css.
 */
const elements = {
  rootBox: "w-full",
  cardBox: "w-full shadow-none",
  card: "w-full gap-4 rounded-lg border border-border bg-card p-5 shadow-xs sm:p-6",
  logoBox: "hidden",
  logoImage: "hidden",
  headerTitle: "hidden",
  headerSubtitle: "hidden",
  socialButtonsBlockButton:
    "h-9 rounded-md border border-input bg-card text-foreground text-[13px] font-medium transition-colors hover:bg-accent",
  socialButtonsBlockButtonText: "text-[13px] font-medium text-foreground!",
  dividerLine: "bg-border",
  dividerText: "text-micro font-medium uppercase text-muted-foreground",
  formFieldLabel: "mb-1 text-caption font-medium text-foreground",
  formFieldInput:
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20",
  formFieldErrorText: "mt-1 text-micro text-destructive",
  formButtonPrimary:
    "h-9 w-full rounded-md text-sm font-medium transition-colors",
  footerAction: "mt-1",
  footerActionText: "text-caption text-muted-foreground",
  footerActionLink:
    "text-caption font-medium text-primary! underline-offset-4 hover:underline",
  identityPreviewText: "text-[13px] text-foreground",
  identityPreviewEditButtonIcon: "text-primary",
  alert: "rounded-md border border-destructive/20 bg-destructive/10",
  alertText: "text-caption text-destructive",
  formResizeButton: "text-primary",
};

const lightVariables = {
  colorPrimary: "#4338ca",
  colorPrimaryForeground: "#ffffff",
  colorBackground: "#ffffff",
  colorText: "#18181b",
  colorTextSecondary: "#71717a",
  colorInputBackground: "#fafaf9",
  colorInputText: "#18181b",
  colorDanger: "#b91c1c",
  colorSuccess: "#15803d",
  colorWarning: "#b45309",
  borderRadius: "0.5rem",
};

const darkVariables = {
  colorPrimary: "#818cf8",
  colorPrimaryForeground: "#0c0c0d",
  colorBackground: "#141416",
  colorText: "#f4f4f5",
  colorTextSecondary: "#a1a1aa",
  colorInputBackground: "#0c0c0d",
  colorInputText: "#f4f4f5",
  colorDanger: "#f87171",
  colorSuccess: "#4ade80",
  colorWarning: "#fbbf24",
  borderRadius: "0.5rem",
};

export function useAuthAppearance() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard for theme-dependent variables
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return {
    elements,
    variables: isDark ? darkVariables : lightVariables,
  };
}
