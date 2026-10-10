"use client";

import { Toaster } from "sonner";

export function ToasterComponent() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "group bg-background text-foreground border border-border",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton: "bg-muted text-muted-foreground hover:bg-muted/80",
        },
      }}
    />
  );
}