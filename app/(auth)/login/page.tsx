import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/shell/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import type { SocialAuthProvider } from "@/features/auth/components/social-auth-buttons";
import { AuthenticatedRedirectGuard } from "@/features/auth/components/auth-redirect-guard";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirects";
import { homePath } from "@/features/businesses/routes";
import { isMagicLinkEnabled } from "@/lib/env";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { AuthFormSkeleton } from "@/features/auth/components/auth-form-skeleton";

export const metadata: Metadata = createNoIndexMetadata({
  description: "Log in to Requo to manage inquiries, quotes, and follow-up.",
  title: "Log in",
});

export const instant = true;

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
  }>;
}) {
  return (
    <AuthShell
      title="Welcome back"
      description="Sign in to your account to continue."
      layout="signup"
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
  }>;
}) {
  const { next } = await searchParams;
  const rawNext = typeof next === "string" ? next : next?.[0];
  const nextPath = getSafeAuthRedirectPath(rawNext, homePath);

  const socialProviders: SocialAuthProvider[] = ["google"];

  return (
    <>
      <AuthenticatedRedirectGuard nextPath={nextPath} />
      <LoginForm
        magicLinkEnabled={isMagicLinkEnabled}
        socialProviders={socialProviders}
      />
    </>
  );
}
