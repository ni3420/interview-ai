"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { AlertCircle } from "lucide-react";
import { AuthShell } from "@/features/components/auth/AuthShell";
import { useAuthAppearance } from "@/features/components/auth/clerkAppearance";

/**
 * Shown when the backend refused to mirror this browser's account because the
 * email address already belongs to another one — see `EMAIL_IN_USE_TARGET`.
 */
function EmailInUseNotice() {
  const params = useSearchParams();
  if (params.get("reason") !== "email-taken") return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-md border border-destructive/20 bg-destructive/10 p-3.5"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="text-caption font-semibold text-destructive">
          This email address is already in use.
        </p>
        <p className="text-micro leading-relaxed text-muted-foreground">
          One account can own an email address.{" "}
          <Link
            href="/sign-in"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in with the existing account
          </Link>{" "}
          or create one with a different email.
        </p>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  const appearance = useAuthAppearance();

  return (
    <AuthShell
      title="Create account"
      description="Set up an account for your interview workspace."
      legal="By creating an account, you agree to the Terms of Service and Privacy Policy."
    >
      <Suspense fallback={null}>
        <EmailInUseNotice />
      </Suspense>
      <SignUp appearance={appearance} />
    </AuthShell>
  );
}
