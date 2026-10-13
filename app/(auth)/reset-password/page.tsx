import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/shell/auth-shell";
import { homePath } from "@/features/businesses/routes";
import { AuthenticatedRedirectGuard } from "@/features/auth/components/auth-redirect-guard";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  description: "Set a new password for your Requo account.",
  title: "Choose a new password",
});

export const instant = true;

export default function ResetPasswordPage() {
  return (
    <AuthShell
      badge="New password"
      title="Choose a new password"
      layout="centered"
    >
      <Suspense fallback={null}>
        <AuthenticatedRedirectGuard nextPath={homePath} />
      </Suspense>
      <ResetPasswordForm />
    </AuthShell>
  );
}
