"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Lock, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { getFieldError } from "@/lib/action-state";
import type { QuoteDiscussionActionState } from "@/features/quote-discussions/types";
import { quoteDiscussionMessageMaxLength } from "@/features/quote-discussions/utils";

type DiscussionComposerProps = {
  action: (
    state: QuoteDiscussionActionState,
    formData: FormData,
  ) => Promise<QuoteDiscussionActionState>;
  disabled?: boolean;
  disabledTitle?: string;
  disabledDescription?: string;
  defaultName?: string;
  showNameField?: boolean;
  placeholder?: string;
  submitLabel?: string;
};

export function DiscussionComposer({
  action,
  disabled = false,
  disabledTitle = "This discussion is read-only",
  disabledDescription = "The quote is closed, so no new messages can be sent. The conversation history stays available.",
  defaultName = "",
  showNameField = false,
  placeholder = "Write a message…",
  submitLabel = "Send message",
}: DiscussionComposerProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionStateWithSonner(action, {});
  const bodyError = getFieldError(state.fieldErrors, "body");
  const nameError = getFieldError(state.fieldErrors, "senderName");

  useEffect(() => {
    if (!state.success) {
      return;
    }

    // The display name is uncontrolled with `defaultValue`, so resetting the
    // form restores it to the prefill instead of blanking a controlled value.
    formRef.current?.reset();
    router.refresh();
  }, [router, state]);

  if (disabled) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-4">
        <Lock
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div>
          <p className="text-sm font-medium text-foreground">{disabledTitle}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {disabledDescription}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" ref={formRef}>
      {showNameField ? (
        <div className="flex flex-col gap-1.5">
          <label
            className="text-sm font-medium"
            htmlFor="discussion-sender-name"
          >
            Your name
          </label>
          <Input
            aria-describedby={
              nameError ? "discussion-sender-name-error" : undefined
            }
            aria-invalid={Boolean(nameError) || undefined}
            autoComplete="name"
            defaultValue={defaultName}
            disabled={isPending}
            id="discussion-sender-name"
            maxLength={120}
            name="senderName"
            placeholder="Maria Santos"
          />
          {nameError ? (
            <p
              className="text-xs text-destructive-ink"
              id="discussion-sender-name-error"
            >
              {nameError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This name is a display label, not a verified identity.
            </p>
          )}
        </div>
      ) : (
        <input name="senderName" type="hidden" value={defaultName} />
      )}

      <div className="flex flex-col gap-1.5">
        <label className="sr-only" htmlFor="discussion-message-body">
          Message
        </label>
        <Textarea
          aria-describedby={
            bodyError ? "discussion-message-body-error" : undefined
          }
          aria-invalid={Boolean(bodyError) || undefined}
          disabled={isPending}
          id="discussion-message-body"
          maxLength={quoteDiscussionMessageMaxLength}
          name="body"
          placeholder={placeholder}
          required
          rows={3}
        />
        {bodyError ? (
          <p
            className="text-xs text-destructive-ink"
            id="discussion-message-body-error"
          >
            {bodyError}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-3">
          <Button disabled={isPending} size="sm" type="submit">
            {isPending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <Send aria-hidden="true" data-icon="inline-start" />
            )}
            {isPending ? "Sending…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
