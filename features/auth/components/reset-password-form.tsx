"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth/client";
import { getAuthErrorMessage, getFieldError, getValidationState } from "@/features/auth/utils";
import { resetPasswordSchema } from "@/features/auth/schemas";
import type { AuthFormState } from "@/features/auth/types";
import { AuthFormFeedback } from "@/features/auth/components/auth-form-feedback";
import {
  AuthPasswordField,
  AuthSubmitButton,
} from "@/features/auth/components/auth-form-fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<AuthFormState>({});
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const validationResult = resetPasswordSchema.safeParse({
      token,
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

    if (!validationResult.success) {
      setState(getValidationState(validationResult.error));
      return;
    }

    setState({});

    startTransition(async () => {
      const result = await authClient.resetPassword({
        token: validationResult.data.token,
        newPassword: validationResult.data.password,
      });

      if (result.error) {
        setState({
          error: getAuthErrorMessage(
            result.error,
            "That reset link is invalid or has expired.",
          ),
        });
        return;
      }

      // Full-page load into a clean login — the old session (if any) is
      // revoked server-side on reset, so client router state is discarded.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- The reset revokes the old session; discard its client state.
      window.location.assign("/login?reset=success");
    });
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-6">
        <AuthFormFeedback
          error="This reset link is missing its token. Request a new password reset email."
          errorTitle="Reset link unavailable"
        />
        <Button asChild className="w-full" size="lg">
          <Link href="/forgot-password">Request a new reset link</Link>
        </Button>
      </div>
    );
  }

  const passwordError = getFieldError(state.fieldErrors, "password");
  const confirmPasswordError = getFieldError(state.fieldErrors, "confirmPassword");

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <AuthFormFeedback
        error={state.error}
        success={state.success}
        errorTitle="We could not reset the password."
      />

      <FieldGroup>
        <AuthPasswordField
          id="password"
          name="password"
          label="New password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={passwordError}
          disabled={isPending}
        />

        <AuthPasswordField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Re-enter your new password"
          error={confirmPasswordError}
          disabled={isPending}
        />
      </FieldGroup>

      <AuthSubmitButton pending={isPending} pendingLabel="Updating password...">
        Reset password
      </AuthSubmitButton>

      <p className="pt-1 text-center text-sm text-muted-foreground">
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href="/forgot-password"
        >
          Request another reset email
        </Link>
      </p>
    </form>
  );
}
