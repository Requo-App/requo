"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Mail } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { getAuthPathWithNext, getSafeAuthRedirectPath } from "@/lib/auth/redirects";
import { onboardingPath } from "@/features/onboarding/routes";
import { homePath } from "@/features/businesses/routes";
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
import { loginSchema, magicLinkEmailSchema } from "@/features/auth/schemas";
import type { AuthFormState } from "@/features/auth/types";
import { AuthFormFeedback } from "@/features/auth/components/auth-form-feedback";
import {
  AuthEmailField,
  AuthPasswordField,
  AuthSubmitButton,
} from "@/features/auth/components/auth-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const resetSuccessMessage =
  "Your password has been updated. Sign in with your new password.";

type LoginFormProps = {
  socialProviders?: SocialAuthProvider[];
  /** When false, hides the magic link CTA (e.g. transactional email not configured). */
  magicLinkEnabled?: boolean;
};

export function LoginForm({
  socialProviders = [],
  magicLinkEnabled = false,
}: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  const nextPath = getSafeAuthRedirectPath(rawNext, homePath);
  // Only forward ?next when it's a genuine non-default redirect
  const signupHref = getAuthPathWithNext(
    "/signup",
    rawNext && nextPath !== homePath ? nextPath : null,
  );
  const [state, setState] = useState<AuthFormState>({});
  const [loadingAction, setLoadingAction] = useState<
    "email" | "magic-link" | SocialAuthProvider | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const [magicLinkOpen, setMagicLinkOpen] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState("");
  const [magicLinkError, setMagicLinkError] = useState<string | undefined>();

  const resetMessage =
    searchParams.get("reset") === "success" ? resetSuccessMessage : undefined;
  const verifiedMessage =
    searchParams.get("verified") === "success"
      ? "Your email is verified. Sign in to continue."
      : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const validationResult = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!validationResult.success) {
      setState(getValidationState(validationResult.error));
      return;
    }

    setState({});
    setLoadingAction("email");

    startTransition(async () => {
      const result = await authClient.signIn.email({
        ...validationResult.data,
        callbackURL: nextPath,
      });

      if (result.error) {
        setLoadingAction(null);
        setState({
          error: getAuthErrorMessage(
            result.error,
            "Your email or password is incorrect.",
          ),
        });
        return;
      }

      // Full-page load so server components read the fresh session cookie.
      window.location.assign(nextPath);
    });
  }

  function handleSocialSignIn(provider: SocialAuthProvider) {
    setState({});
    setLoadingAction(provider);

    startTransition(async () => {
      const error = await requestSocialSignIn(provider, {
        callbackURL: nextPath,
        newUserCallbackURL: "/onboarding",
        fallbackMessage: `We couldn't continue with ${provider} right now.`,
      });

      if (error) {
        setLoadingAction(null);
        setState({ error });
      }
    });
  }

  function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationResult = magicLinkEmailSchema.safeParse({
      email: magicLinkEmail,
    });

    if (!validationResult.success) {
      setMagicLinkError(
        getFieldError(
          getValidationState(validationResult.error).fieldErrors,
          "email",
        ) ?? "Enter a valid email.",
      );
      return;
    }

    setMagicLinkError(undefined);
    setLoadingAction("magic-link");

    startTransition(async () => {
      const errorCallbackURL =
        rawNext !== null && rawNext !== ""
          ? `/login?next=${encodeURIComponent(rawNext)}`
          : "/login";

      const result = await authClient.signIn.magicLink({
        email: validationResult.data.email,
        callbackURL: nextPath,
        newUserCallbackURL: onboardingPath,
        errorCallbackURL,
      });

      setLoadingAction(null);

      if (result.error) {
        setMagicLinkError(
          getAuthErrorMessage(
            result.error,
            "We couldn't send a sign-in link. Try again shortly.",
          ),
        );
        return;
      }

      setMagicLinkOpen(false);
      const checkEmailParams = new URLSearchParams({
        reason: "magic-link",
        email: validationResult.data.email,
      });
      if (rawNext && nextPath !== homePath) {
        checkEmailParams.set("next", nextPath);
      }
      router.push(`/check-email?${checkEmailParams.toString()}`);
    });
  }

  const emailError = getFieldError(state.fieldErrors, "email");
  const passwordError = getFieldError(state.fieldErrors, "password");
  const urlMagicLinkError = getMagicLinkQueryErrorMessage(
    searchParams.get("error"),
  );

  return (
    <>
    <form className="form-stack" onSubmit={handleSubmit}>
      <AuthFormFeedback
        error={state.error ?? urlMagicLinkError ?? undefined}
        success={state.success ?? verifiedMessage ?? resetMessage}
        successTitle={
          verifiedMessage
            ? "Email verified"
            : resetMessage
              ? "Password updated"
              : undefined
        }
      />

      <div className="grid gap-2">
        <SocialAuthButtons
          disabled={isPending}
          loadingProvider={
            isPending && loadingAction !== "email" && loadingAction !== "magic-link"
              ? (loadingAction as SocialAuthProvider)
              : null
          }
          onProviderClick={handleSocialSignIn}
          providers={socialProviders}
        />

        {magicLinkEnabled ? (
          <Button
            className="w-full"
            disabled={isPending}
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setMagicLinkOpen(true)}
          >
            <Mail className="size-4" />
            Continue with email link
          </Button>
        ) : null}
      </div>

      <AuthEmailDivider />

      <FieldGroup>
        <AuthEmailField id="login-email" error={emailError} disabled={isPending} />

        <AuthPasswordField
          id="password"
          name="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Enter your password"
          error={passwordError}
          disabled={isPending}
          labelAction={
            <Link
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              href="/forgot-password"
            >
              Forgot password?
            </Link>
          }
        />
      </FieldGroup>

      <AuthSubmitButton
        pending={isPending && loadingAction === "email"}
        pendingLabel="Signing in..."
      >
        Sign in
      </AuthSubmitButton>

      <p className="pt-1 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          className="font-medium text-foreground underline-offset-4 hover:underline"
          href={signupHref}
        >
          Create an account
        </Link>
      </p>
    </form>

      {magicLinkEnabled ? (
        <Dialog open={magicLinkOpen} onOpenChange={(open) => {
          setMagicLinkOpen(open);
          if (!open) {
            setMagicLinkError(undefined);
            setMagicLinkEmail("");
          }
        }}>
          <DialogContent className="max-w-md">
            <form onSubmit={handleMagicLinkSubmit}>
              <AuthFormFeedback error={magicLinkError} />
              <DialogHeader>
                <DialogTitle>Sign in with a link</DialogTitle>
                <DialogDescription>
                  Enter your email and we&apos;ll send you a one-time sign-in link.
                </DialogDescription>
              </DialogHeader>
              <div className="px-5 py-4 sm:px-6">
                <Field data-invalid={Boolean(magicLinkError) || undefined}>
                  <FieldLabel htmlFor="magic-link-email">Email address</FieldLabel>
                  <FieldContent>
                    <Input
                      id="magic-link-email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      maxLength={320}
                      placeholder="owner@example.com"
                      required
                      aria-invalid={Boolean(magicLinkError) || undefined}
                      disabled={isPending && loadingAction === "magic-link"}
                      value={magicLinkEmail}
                      onChange={(e) => {
                        setMagicLinkEmail(e.currentTarget.value);
                        setMagicLinkError(undefined);
                      }}
                    />
                    <FieldError
                      errors={magicLinkError ? [{ message: magicLinkError }] : undefined}
                    />
                  </FieldContent>
                </Field>
              </div>
              <DialogFooter>
                <Button
                  className="w-full sm:w-auto"
                  disabled={isPending && loadingAction === "magic-link"}
                  type="submit"
                  size="lg"
                >
                  {isPending && loadingAction === "magic-link" ? (
                    <>
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                      Sending link...
                    </>
                  ) : (
                    "Send sign-in link"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
