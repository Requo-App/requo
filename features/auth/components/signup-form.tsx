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
  requestSocialSignIn,
} from "@/features/auth/utils";
import {
  signupSchema,
} from "@/features/auth/schemas";
import { joinFullName } from "@/features/account/name";
import type { AuthFormState } from "@/features/auth/types";
import { AuthFormFeedback } from "@/features/auth/components/auth-form-feedback";
import {
  AuthEmailField,
  AuthPasswordField,
  AuthSubmitButton,
} from "@/features/auth/components/auth-form-fields";
import { onboardingPath } from "@/features/onboarding/routes";
import { homePath } from "@/features/businesses/routes";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
      // Client-side push: verification completes via the emailed link, so no
      // session exists yet and a full reload would gain nothing.
      const checkEmailParams = new URLSearchParams({
        email: validationResult.data.email,
      });
      if (rawNext && nextPath !== onboardingPath) {
        checkEmailParams.set("next", nextPath);
      }
      router.push(`/check-email?${checkEmailParams.toString()}`);
    });
  }

  function handleSocialSignIn(provider: SocialAuthProvider) {
    setState({});
    setLoadingAction(provider);

    startTransition(async () => {
      // Existing users land on businesses; brand-new users land on onboarding (nextPath default)
      const error = await requestSocialSignIn(provider, {
        callbackURL: homePath,
        newUserCallbackURL: nextPath,
        fallbackMessage: `We couldn't continue with ${provider} right now.`,
      });

      if (error) {
        setLoadingAction(null);
        setState({ error });
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

        <AuthEmailField id="signup-email" error={emailError} disabled={isPending} />

        <AuthPasswordField
          id="password"
          name="password"
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={passwordError}
          disabled={isPending}
        />
      </FieldGroup>

      <AuthSubmitButton
        pending={isPending && loadingAction === "email"}
        pendingLabel="Creating your account..."
      >
        Create account
      </AuthSubmitButton>

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
