"use client";

import type { ReactNode } from "react";

import { FormActions } from "@/components/shared/form-layout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/features/auth/components/password-input";

type AuthEmailFieldProps = {
  id: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Shared email field for auth forms — identical Field structure, ids stay
 * per-form so tests and assistive tech see no change. (The magic-link
 * dialog keeps its bespoke controlled input.)
 */
export function AuthEmailField({
  id,
  error,
  disabled,
  placeholder = "owner@example.com",
}: AuthEmailFieldProps) {
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>Email address</FieldLabel>
      <FieldContent>
        <Input
          id={id}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={320}
          placeholder={placeholder}
          required
          aria-invalid={Boolean(error) || undefined}
          disabled={disabled}
        />
        <FieldError errors={error ? [{ message: error }] : undefined} />
      </FieldContent>
    </Field>
  );
}

type AuthPasswordFieldProps = {
  id: string;
  name: string;
  label: ReactNode;
  autoComplete: string;
  placeholder: string;
  error?: string;
  disabled?: boolean;
  /** Extra control beside the label (e.g. the forgot-password link). */
  labelAction?: ReactNode;
};

/** Shared password field for auth forms — see AuthEmailField. */
export function AuthPasswordField({
  id,
  name,
  label,
  autoComplete,
  placeholder,
  error,
  disabled,
  labelAction,
}: AuthPasswordFieldProps) {
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      {labelAction ? (
        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {labelAction}
        </div>
      ) : (
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
      )}
      <FieldContent>
        <PasswordInput
          id={id}
          name={name}
          autoComplete={autoComplete}
          maxLength={128}
          minLength={8}
          placeholder={placeholder}
          required
          aria-invalid={Boolean(error) || undefined}
          disabled={disabled}
        />
        <FieldError errors={error ? [{ message: error }] : undefined} />
      </FieldContent>
    </Field>
  );
}

type AuthSubmitButtonProps = {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
};

/** Full-width auth submit with spinner state. */
export function AuthSubmitButton({
  pending,
  pendingLabel,
  children,
}: AuthSubmitButtonProps) {
  return (
    <FormActions className="items-stretch sm:items-stretch">
      <Button className="w-full" disabled={pending} type="submit" size="lg">
        {pending ? (
          <>
            <Spinner data-icon="inline-start" aria-hidden="true" />
            {pendingLabel}
          </>
        ) : (
          children
        )}
      </Button>
    </FormActions>
  );
}
