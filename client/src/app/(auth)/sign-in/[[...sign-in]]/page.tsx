"use client";

import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/features/components/auth/AuthShell";
import { useAuthAppearance } from "@/features/components/auth/clerkAppearance";

export default function SignInPage() {
  const appearance = useAuthAppearance();

  return (
    <AuthShell
      title="Sign in"
      description="Continue to your interview workspace."
      legal="By continuing, you agree to the Terms of Service and Privacy Policy."
      footer={
        <p>
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      }
    >
      <SignIn appearance={appearance} />
    </AuthShell>
  );
}
