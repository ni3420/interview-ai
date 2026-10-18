"use client";

import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { ArrowLeft, Sparkles } from "lucide-react";

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-white px-4 py-8 dark:bg-slate-950 sm:py-12">
      {/* Background Ambient Gradient Glows */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_45%_at_50%_30%,rgba(139,92,246,0.12),transparent_100%)] dark:bg-[radial-gradient(50%_45%_at_50%_30%,rgba(124,58,237,0.22),transparent_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center">
        {/* Navigation Back Link */}
        <div className="mb-5 w-full text-left">
          <Link
            href="/"
            className="group inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-900 dark:text-slate-500 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
            Back to Home
          </Link>
        </div>

        {/* Card Header & Branding */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 dark:bg-primary/20">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            Create Account
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Start your AI-powered interview preparation journey today
          </p>
        </div>

        {/* Customized Modern Clerk Sign-Up Component */}
        <div className="w-full">
          <SignUp
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "w-full shadow-xl rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-5 sm:p-7",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton:
                  "border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all shadow-sm rounded-xl h-10",
                socialButtonsBlockButtonText: "font-semibold",
                dividerLine: "bg-slate-200 dark:bg-slate-800",
                dividerText: "text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-widest font-bold",
                formFieldLabel:
                  "text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 tracking-wider mb-1",
                formFieldInput:
                  "flex h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 transition-all",
                formButtonPrimary:
                  "h-10 w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-md transition-all active:scale-[0.98]",
                footerActionLink:
                  "text-primary hover:text-primary/90 font-semibold text-xs transition-colors",
                identityPreviewText: "text-slate-700 dark:text-slate-300 font-medium text-xs",
                identityPreviewEditButtonIcon: "text-primary",
              },
            }}
          />
        </div>

        {/* Footer Text */}
        <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-500 max-w-xs">
          By signing up, you agree to our Terms of Service & Privacy Policy.
        </p>
      </div>
    </div>
  );
}