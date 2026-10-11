import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/shell/auth-shell";
import { SignupForm } from "@/features/auth/components/signup-form";
import type { SocialAuthProvider } from "@/features/auth/components/social-auth-buttons";
import { getAccountProfileForUser } from "@/features/account/queries";
import { getBusinessMembershipsForUser } from "@/lib/db/business-access";
import { onboardingPath } from "@/features/onboarding/routes";
import { dashboardPath } from "@/features/businesses/routes";
import { getOptionalSession } from "@/lib/auth/session";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { AuthFormSkeleton } from "@/features/auth/components/auth-form-skeleton";

export const metadata: Metadata = createNoIndexMetadata({
  description:
    "Create a Requo account to manage inquiries, send quotes, and follow up in one place.",
  title: "Create account",
});

export const instant = true;

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      description="Start managing inquiries and quotes in one place."
      layout="signup"
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <SignupContent />
      </Suspense>
    </AuthShell>
  );
}

async function SignupContent() {
  // Server-side redirect for already-authenticated users — avoids client-side flash
  const session = await getOptionalSession();
  if (session) {
    const [memberships, profile] = await Promise.all([
      getBusinessMembershipsForUser(session.user.id),
      getAccountProfileForUser(session.user.id),
    ]);
    const hasOnboarded =
      memberships.length > 0 || Boolean(profile?.onboardingCompletedAt);
    redirect(hasOnboarded ? dashboardPath : onboardingPath);
  }

  const socialProviders: SocialAuthProvider[] = ["google"];

  return (
    <SignupForm
      socialProviders={socialProviders}
    />
  );
}
