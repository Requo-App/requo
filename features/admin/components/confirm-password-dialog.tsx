"use client";

import { useCallback, useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { issuePasswordConfirmTokenAction } from "@/features/admin/confirm-actions";

type ConfirmPasswordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the token once password verified. */
  onConfirmed: (token: string) => void | Promise<void>;
  /**
   * Short label for the action being confirmed (e.g., "Suspend user").
   * Rendered in the dialog body so the admin sees what they're about
   * to authorize.
   */
  actionLabel: string;
  /** Optional short description rendered below the label. */
  description?: string;
  /** Optional button copy for the primary submit button. Defaults to "Confirm". */
  confirmLabel?: string;
};

/**
 * Password re-confirmation gate presented before destructive admin
 * mutations (Requirement 9). On success, issues a short-lived
 * single-use token via `issuePasswordConfirmTokenAction` and hands it
 * back to the parent, which must pass the token into the follow-up
 * destructive action within the TTL.
 *
 * The caller owns `open`; the form body is mounted only while open so
 * local password + error state resets naturally on every invocation
 * without a state-reset effect.
 */
export function ConfirmPasswordDialog({
  open,
  onOpenChange,
  onConfirmed,
  actionLabel,
  description,
  confirmLabel = "Confirm",
}: ConfirmPasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm your password</DialogTitle>
          <DialogDescription>
            Re-enter your password to authorize this action.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ConfirmPasswordDialogBody
            actionLabel={actionLabel}
            confirmLabel={confirmLabel}
            description={description}
            onConfirmed={onConfirmed}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type ConfirmPasswordDialogBodyProps = Pick<
  ConfirmPasswordDialogProps,
  "actionLabel" | "description" | "confirmLabel" | "onConfirmed" | "onOpenChange"
> & {
  confirmLabel: string;
};

function ConfirmPasswordDialogBody({
  actionLabel,
  description,
  confirmLabel,
  onConfirmed,
  onOpenChange,
}: ConfirmPasswordDialogBodyProps) {
  const passwordInputId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (isPending) {
        return;
      }

      if (password.length === 0) {
        setError("Enter your password to continue.");
        return;
      }

      setError(null);

      startTransition(async () => {
        const result = await issuePasswordConfirmTokenAction({ password });

        if (!result.ok) {
          // Clear the password so a typo doesn't linger between tries,
          // then refocus the input for a quick retry.
          setPassword("");
          setError(result.error);
          inputRef.current?.focus();
          return;
        }

        const token = result.data?.token;
        if (!token) {
          // Defensive: the action contract guarantees a token on ok,
          // but guard so we never silently close the dialog on malformed
          // payloads.
          setPassword("");
          setError("We couldn't issue a confirmation token. Try again.");
          inputRef.current?.focus();
          return;
        }

        setPassword("");
        setError(null);
        onOpenChange(false);

        try {
          await onConfirmed(token);
        } catch (callbackError) {
          // The parent owns error surfacing for the downstream action;
          // log defensively so we don't swallow a thrown callback.
          console.error("ConfirmPasswordDialog onConfirmed threw.", callbackError);
        }
      });
    },
    [isPending, onConfirmed, onOpenChange, password],
  );

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogBody>
        <FieldGroup>
          <Field>
            <FieldLabel>Action</FieldLabel>
            <FieldContent>
              <p className="text-sm font-medium text-foreground">
                {actionLabel}
              </p>
              {description ? (
                <FieldDescription>{description}</FieldDescription>
              ) : null}
            </FieldContent>
          </Field>

          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor={passwordInputId}>Password</FieldLabel>
            <FieldContent>
              <Input
                ref={inputRef}
                id={passwordInputId}
                name="password"
                type="password"
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={isPending}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
              />
              {error ? (
                <p
                  id={errorId}
                  role="alert"
                  aria-live="polite"
                  className="text-sm text-destructive-ink"
                >
                  {error}
                </p>
              ) : null}
            </FieldContent>
          </Field>
        </FieldGroup>
      </DialogBody>
      <DialogFooter>
        <Button
          disabled={isPending}
          onClick={() => onOpenChange(false)}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button disabled={isPending || password.length === 0} type="submit">
          {isPending ? (
            <>
              <Spinner data-icon="inline-start" aria-hidden="true" />
              Confirming…
            </>
          ) : (
            confirmLabel
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
