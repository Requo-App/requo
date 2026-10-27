"use client";

import { useEffect, useState } from "react";

import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    if (state.success) {
      onSuccess?.();
    }
  }, [state.success, onSuccess]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
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
          className="text-sm"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-destructive-ink">{state.error}</p>
      ) : null}

      <Button type="submit" disabled={isPending || !message.trim()} size="lg">
        {isPending ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : null}
        Submit revision request
      </Button>
    </form>
  );
}
