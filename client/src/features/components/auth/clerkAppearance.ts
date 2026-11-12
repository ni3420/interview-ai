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
  cardBox: "w-full shadow-none!",
  card: "w-full gap-5 rounded-none bg-transparent! p-0! shadow-none!",
  logoBox: "hidden",
  logoImage: "hidden",
  headerTitle: "hidden",
  headerSubtitle: "hidden",
  socialButtonsBlockButton:
    "h-9 rounded-md border! bg-transparent! text-foreground text-[13px] font-medium shadow-none! transition-colors hover:bg-accent",
  socialButtonsBlockButtonText: "text-[13px] font-medium text-foreground!",
  dividerLine: "bg-border!",
  dividerText: "text-micro font-medium uppercase text-muted-foreground",
  formFieldLabel: "mb-1 text-caption font-medium text-foreground",
  formFieldInput:
    "h-9 w-full rounded-md border! px-3 text-sm text-foreground shadow-none! outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20",
  formFieldErrorText: "mt-1 text-micro text-destructive",
  formButtonPrimary:
    "h-10 w-full rounded-md text-[13px] font-semibold shadow-none! transition-colors",
  footer: "hidden!",
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
  colorPrimary: "#1c1b17",
  colorPrimaryForeground: "#f7f4ec",
  colorBackground: "#f3f0e8",
  colorText: "#171714",
  colorTextSecondary: "#646158",
  colorBorder: "#d9d3c4",
  colorInputBackground: "#fffdf7",
  colorInputText: "#171714",
  colorDanger: "#c93625",
  colorSuccess: "#3f6b3a",
  colorWarning: "#b45309",
  borderRadius: "0.375rem",
};

const darkVariables = {
  colorPrimary: "#f5f2ea",
  colorPrimaryForeground: "#14130f",
  colorBackground: "#14130f",
  colorText: "#f5f2ea",
  colorTextSecondary: "#b3ada0",
  colorBorder: "#3a352c",
  colorInputBackground: "#201d17",
  colorInputText: "#f5f2ea",
  colorDanger: "#ff826d",
  colorSuccess: "#8fbf85",
  colorWarning: "#fbbf24",
  borderRadius: "0.375rem",
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
