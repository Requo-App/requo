"use client";
import { useEffect, useRef, useState } from "react";
import { Check, CircleSlash } from "lucide-react";

import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { getFieldError } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type {
  PublicQuoteResolvedSnapshot,
  PublicQuoteResponseActionState,
} from "@/features/quotes/types";
import { QUOTE_ACCEPTANCE_TEXT } from "@/features/quotes/acceptance-text";

type PublicQuoteResponseFormProps = {
  action: (
    state: PublicQuoteResponseActionState,
    formData: FormData,
  ) => Promise<PublicQuoteResponseActionState>;
  onResolved?: (snapshot: PublicQuoteResolvedSnapshot) => void;
  expectedVersion?: number;
};

const initialState: PublicQuoteResponseActionState = {};

export function PublicQuoteResponseForm({
  action,
  onResolved,
  expectedVersion,
}: PublicQuoteResponseFormProps) {
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    initialState,
  );
  const messageError = getFieldError(state.fieldErrors, "message");
  const signerError = getFieldError(state.fieldErrors, "signerName");
  const confirmedError = getFieldError(state.fieldErrors, "confirmed");
  const lastResolvedKeyRef = useRef<string | null>(null);
  const [submittedResponse, setSubmittedResponse] = useState<"accepted" | "rejected" | null>(null);
  const [signerName, setSignerName] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!state.resolvedQuote) {
      return;
    }

    const key = `${state.resolvedQuote.status}:${state.resolvedQuote.customerRespondedAt}`;

    if (lastResolvedKeyRef.current === key) {
      return;
    }

    lastResolvedKeyRef.current = key;
    onResolved?.(state.resolvedQuote);
  }, [onResolved, state.resolvedQuote]);

  const pendingAccept = isPending && submittedResponse === "accepted";
  const pendingDecline = isPending && submittedResponse === "rejected";
  const canAccept = signerName.trim().length >= 2 && confirmed && !isPending;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {expectedVersion != null ? (
        <input type="hidden" name="expectedVersion" value={expectedVersion} />
      ) : null}
      {/* Accept & Sign */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="public-quote-signer" className="text-sm font-medium">
          Your name
        </label>
        <Input
          id="public-quote-signer"
          name="signerName"
          autoComplete="name"
          maxLength={120}
          placeholder="Maria Santos"
          value={signerName}
          onChange={(event) => setSignerName(event.target.value)}
          aria-invalid={Boolean(signerError) || undefined}
          aria-describedby={signerError ? "public-quote-signer-error" : undefined}
          disabled={isPending}
          className="text-sm"
        />
        {signerError ? (
          <p className="text-xs text-destructive-ink" id="public-quote-signer-error">
            {signerError}
          </p>
        ) : null}
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(value) => setConfirmed(value === true)}
          disabled={isPending}
          aria-invalid={Boolean(confirmedError) || undefined}
          aria-describedby={confirmedError ? "public-quote-confirmed-error" : undefined}
          className="mt-0.5"
        />
        <input type="hidden" name="confirmed" value={confirmed ? "true" : ""} />
        <span>{QUOTE_ACCEPTANCE_TEXT}</span>
      </label>
      {confirmedError ? (
        <p className="-mt-2 text-xs text-destructive-ink" id="public-quote-confirmed-error">
          {confirmedError}
        </p>
      ) : null}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          className="flex-1"
          disabled={!canAccept}
          name="response"
          size="lg"
          type="submit"
          value="accepted"
          onClick={() => { setSubmittedResponse("accepted"); }}
        >
          {pendingAccept ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : (
            <Check data-icon="inline-start" />
          )}
          Accept &amp; Sign
        </Button>
        <Button
          className="flex-1"
          disabled={isPending}
          name="response"
          size="lg"
          type="submit"
          value="rejected"
          variant="outline"
          onClick={() => { setSubmittedResponse("rejected"); }}
        >
          {pendingDecline ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : (
            <CircleSlash data-icon="inline-start" />
          )}
          Decline
        </Button>
      </div>

      {/* Optional message */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="public-quote-message"
          className="text-sm text-muted-foreground"
        >
          Message (optional)
        </label>
        <Textarea
          id="public-quote-message"
          maxLength={1200}
          name="message"
          rows={2}
          placeholder="Add a note about your decision..."
          aria-invalid={Boolean(messageError) || undefined}
          disabled={isPending}
          className="text-sm"
        />
        {messageError ? (
          <p className="text-xs text-destructive-ink">{messageError}</p>
        ) : null}
      </div>
    </form>
  );
}
