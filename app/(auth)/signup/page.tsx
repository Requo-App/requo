import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/shell/auth-shell";
import { SignupForm } from "@/features/auth/components/signup-form";
import type { SocialAuthProvider } from "@/features/auth/components/social-auth-buttons";
import { AuthenticatedRedirectGuard } from "@/features/auth/components/auth-redirect-guard";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirects";
import { homePath } from "@/features/businesses/routes";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { AuthFormSkeleton } from "@/features/auth/components/auth-form-skeleton";

export const metadata: Metadata = createNoIndexMetadata({
  description:
    "Create a Requo account to manage inquiries, send quotes, and follow up in one place.",
  title: "Create account",
});

export const instant = true;

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
  }>;
}) {
  return (
    <AuthShell
      title="Create your account"
      description="Start managing inquiries and quotes in one place."
      layout="signup"
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <SignupContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function SignupContent({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
  }>;
}) {
  const { next } = await searchParams;
  const rawNext = typeof next === "string" ? next : next?.[0];
  // Authenticated visitors only: onboarded users continue to `?next`
  // (dashboard by default); everyone else goes to onboarding via the guard.
  const nextPath = getSafeAuthRedirectPath(rawNext, homePath);

  const socialProviders: SocialAuthProvider[] = ["google"];

  return (
    <>
      <AuthenticatedRedirectGuard nextPath={nextPath} />
      <SignupForm
        socialProviders={socialProviders}
      />
    </>
  );
}
