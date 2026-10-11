"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { authClient } from "@/lib/auth/client";
import { getAuthPathWithNext, getSafeAuthRedirectPath } from "@/lib/auth/redirects";
import {
  AuthEmailDivider,
  SocialAuthButtons,
  type SocialAuthProvider,
} from "@/features/auth/components/social-auth-buttons";
import {
  getAuthErrorMessage,
  getFieldError,
  getMagicLinkQueryErrorMessage,
  getValidationState,
} from "@/features/auth/utils";
import {
  signupSchema,
} from "@/features/auth/schemas";
import { joinFullName } from "@/features/account/name";
import type { AuthFormState } from "@/features/auth/types";
import { AuthFormFeedback } from "@/features/auth/components/auth-form-feedback";
import { onboardingPath } from "@/features/onboarding/routes";
import { dashboardPath } from "@/features/businesses/routes";
import { FormActions } from "@/components/shared/form-layout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/features/auth/components/password-input";

type SignupFormProps = {
  socialProviders?: SocialAuthProvider[];
};

export function SignupForm({
  socialProviders = [],
}: SignupFormProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawNext = searchParams.get("next");
  const nextPath = getSafeAuthRedirectPath(rawNext, onboardingPath);
  // Only forward ?next when it's a genuine non-default redirect
  const loginHref = getAuthPathWithNext("/login", rawNext && nextPath !== onboardingPath ? nextPath : null);
  const [state, setState] = useState<AuthFormState>({});
  const [loadingAction, setLoadingAction] = useState<
    "email" | SocialAuthProvider | null
  >(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    const formData = new FormData(event.currentTarget);
    const validationResult = signupSchema.safeParse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!validationResult.success) {
      setState(getValidationState(validationResult.error));
      return;
    }

    setState({});
    setLoadingAction("email");
    const verificationCallback = `/login?verified=success&next=${encodeURIComponent(nextPath)}`;

    startTransition(async () => {
      const result = await authClient.signUp.email({
        name: joinFullName(
          validationResult.data.firstName,
          validationResult.data.lastName,
        ),
        email: validationResult.data.email,
        password: validationResult.data.password,
        callbackURL: verificationCallback,
      });

      if (result.error) {
        setLoadingAction(null);
        setState({
          error: getAuthErrorMessage(
            result.error,
            "We couldn't create your account. Try a different email address.",
          ),
        });
        return;
      }

      form.reset();
      router.push(`/check-email?email=${encodeURIComponent(validationResult.data.email)}`);
    });
  }

  function handleSocialSignIn(provider: SocialAuthProvider) {
    setState({});
    setLoadingAction(provider);

    startTransition(async () => {
      const result = await authClient.signIn.social({
        provider,
        // Existing users land on businesses; brand-new users land on onboarding (nextPath default)
        callbackURL: dashboardPath,
        newUserCallbackURL: nextPath,
      });

      if (result.error) {
        setLoadingAction(null);
        setState({
          error: getAuthErrorMessage(
            result.error,
            `We couldn't continue with ${provider} right now.`,
          ),
        });
      }
    });
  }

  const firstNameError = getFieldError(state.fieldErrors, "firstName");
  const lastNameError = getFieldError(state.fieldErrors, "lastName");
  const emailError = getFieldError(state.fieldErrors, "email");
  const passwordError = getFieldError(state.fieldErrors, "password");

  const urlMagicLinkError = getMagicLinkQueryErrorMessage(
    searchParams.get("error"),
  );

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <AuthFormFeedback
        error={state.error ?? urlMagicLinkError ?? undefined}
        success={state.success}
      />

      <SocialAuthButtons
        disabled={isPending}
        loadingProvider={
          isPending && loadingAction !== "email"
            ? (loadingAction as SocialAuthProvider)
            : null
        }
        onProviderClick={handleSocialSignIn}
        providers={socialProviders}
      />

      <AuthEmailDivider />

      <FieldGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field data-invalid={Boolean(firstNameError) || undefined}>
            <FieldLabel htmlFor="signup-first-name">First name</FieldLabel>
            <FieldContent>
              <Input
                id="signup-first-name"
                name="firstName"
                autoComplete="given-name"
                maxLength={60}
                minLength={1}
                placeholder="Alicia"
                required
                aria-invalid={Boolean(firstNameError) || undefined}
                disabled={isPending}
              />
              <FieldError
                errors={firstNameError ? [{ message: firstNameError }] : undefined}
              />
            </FieldContent>
          </Field>

          <Field data-invalid={Boolean(lastNameError) || undefined}>
            <FieldLabel htmlFor="signup-last-name">Last name</FieldLabel>
            <FieldContent>
              <Input
                id="signup-last-name"
                name="lastName"
                autoComplete="family-name"
                maxLength={60}
                minLength={1}
                placeholder="Cruz"
                required
                aria-invalid={Boolean(lastNameError) || undefined}
                disabled={isPending}
              />
              <FieldError
                errors={lastNameError ? [{ message: lastNameError }] : undefined}
              />
            </FieldContent>
          </Field>
        </div>

        <Field data-invalid={Boolean(emailError) || undefined}>
          <FieldLabel htmlFor="signup-email">Email address</FieldLabel>
          <FieldContent>
            <Input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={320}
              placeholder="owner@example.com"
              required
              aria-invalid={Boolean(emailError) || undefined}
              disabled={isPending}
            />
            <FieldError errors={emailError ? [{ message: emailError }] : undefined} />
          </FieldContent>
        </Field>

        <Field data-invalid={Boolean(passwordError) || undefined}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <FieldContent>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              maxLength={128}
              minLength={8}
              placeholder="At least 8 characters"
              required
              aria-invalid={Boolean(passwordError) || undefined}
              disabled={isPending}
            />
            <FieldError
              errors={passwordError ? [{ message: passwordError }] : undefined}
            />
          </FieldContent>
        </Field>
      </FieldGroup>

      <FormActions className="items-stretch sm:items-stretch">
        <Button className="w-full" disabled={isPending} type="submit" size="lg">
          {isPending && loadingAction === "email" ? (
            <>
              <Spinner data-icon="inline-start" aria-hidden="true" />
              Creating your account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </FormActions>

      <p className="pt-1 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={loginHref}
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
