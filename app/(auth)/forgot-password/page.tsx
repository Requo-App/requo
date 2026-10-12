import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/shell/auth-shell";
import { homePath } from "@/features/businesses/routes";
import { AuthenticatedRedirectGuard } from "@/features/auth/components/auth-redirect-guard";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  description: "Request a password reset link for your Requo account.",
  title: "Reset password",
});

export const instant = true;

export default function ForgotPasswordPage() {
  return (
    <AuthShell badge="Recovery" title="Reset password" layout="centered">
      <Suspense fallback={null}>
        <AuthenticatedRedirectGuard nextPath={homePath} />
      </Suspense>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
