"use client";

import Link from "next/link";
import { FormEvent, useRef, useState, useTransition } from "react";

import { authClient } from "@/lib/auth/client";
import { getAuthErrorMessage, getFieldError, getValidationState } from "@/features/auth/utils";
import { forgotPasswordSchema } from "@/features/auth/schemas";
import type { AuthFormState } from "@/features/auth/types";
import { AuthFormFeedback } from "@/features/auth/components/auth-form-feedback";
import {
  getTurnstileFetchOptions,
  TurnstileChallenge,
  type TurnstileChallengeHandle,
} from "@/features/auth/components/turnstile-challenge";
import {
  AuthEmailField,
  AuthSubmitButton,
} from "@/features/auth/components/auth-form-fields";
import { FieldGroup } from "@/components/ui/field";

const successMessage =
  "If that email exists, we sent a reset link.";

type ForgotPasswordFormProps = {
  /** Renders the optional Turnstile challenge when bot protection is configured. */
  turnstileSiteKey?: string;
};

export function ForgotPasswordForm({
  turnstileSiteKey,
}: ForgotPasswordFormProps) {
  const [state, setState] = useState<AuthFormState>({});
  const [isPending, startTransition] = useTransition();
  const turnstileRef = useRef<TurnstileChallengeHandle>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const validationResult = forgotPasswordSchema.safeParse({
      email: formData.get("email"),
    });

    if (!validationResult.success) {
      setState(getValidationState(validationResult.error));
      return;
    }

    const turnstileToken = turnstileRef.current?.getToken() ?? null;

    if (turnstileSiteKey && !turnstileToken) {
      setState({ error: "Complete the security check and try again." });
      return;
    }

    setState({});

    startTransition(async () => {
      const result = await authClient.requestPasswordReset({
        email: validationResult.data.email,
        redirectTo: "/reset-password",
        ...getTurnstileFetchOptions(turnstileToken),
      });

      if (result.error) {
        turnstileRef.current?.reset();
        setState({
          error: getAuthErrorMessage(
            result.error,
            "We couldn't submit the reset request. Try again in a moment.",
          ),
        });
        return;
      }

      // No navigation: the user acts through the emailed link, so the form
      // stays and confirms via toast. Reset the consumed token so the form
      // can submit another address without a stale challenge.
      turnstileRef.current?.reset();
      setState({
        success: successMessage,
      });
    });
  }

  const emailError = getFieldError(state.fieldErrors, "email");

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <AuthFormFeedback
        error={state.error}
        success={state.success}
        successTitle="Check your inbox"
      />

      <FieldGroup>
        <AuthEmailField id="email" error={emailError} disabled={isPending} />
      </FieldGroup>

      {turnstileSiteKey ? (
        <TurnstileChallenge ref={turnstileRef} siteKey={turnstileSiteKey} />
      ) : null}

      <AuthSubmitButton pending={isPending} pendingLabel="Sending reset link...">
        Send reset link
      </AuthSubmitButton>

      <p className="pt-1 text-center text-sm text-muted-foreground">
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href="/login"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
