"use client";

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
    >
      <SignIn appearance={appearance} />
    </AuthShell>
  );
}
