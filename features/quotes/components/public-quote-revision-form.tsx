"use client";

import { useEffect, useState } from "react";

import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { getFieldError } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import {
  DialogBody,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { PublicQuoteRevisionRequestActionState } from "@/features/quotes/types";

type PublicQuoteRevisionFormProps = {
  action: (
    state: PublicQuoteRevisionRequestActionState,
    formData: FormData,
  ) => Promise<PublicQuoteRevisionRequestActionState>;
  onSuccess?: () => void;
};

const initialState: PublicQuoteRevisionRequestActionState = {};

export function PublicQuoteRevisionForm({
  action,
  onSuccess,
}: PublicQuoteRevisionFormProps) {
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );
  const [message, setMessage] = useState("");
  const messageError = getFieldError(state.fieldErrors, "message");

  useEffect(() => {
    if (state.success) {
      onSuccess?.();
    }
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <DialogBody className="flex flex-col gap-1.5">
        <label
          htmlFor="revision-message"
          className="text-sm font-medium text-foreground"
        >
          What would you like changed?
        </label>
        <Textarea
          id="revision-message"
          name="message"
          maxLength={2000}
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
          placeholder="Describe the changes you'd like..."
          disabled={isPending}
          aria-invalid={Boolean(messageError) || undefined}
          aria-describedby={messageError ? "revision-message-error" : undefined}
          className="text-sm"
        />
        {messageError ? (
          <p className="text-xs text-destructive-ink" id="revision-message-error">
            {messageError}
          </p>
        ) : state.error ? (
          <p className="text-xs text-destructive-ink">{state.error}</p>
        ) : null}
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button disabled={isPending} type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending || !message.trim()}>
          {isPending ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : null}
          Submit revision request
        </Button>
      </DialogFooter>
    </form>
  );
}
