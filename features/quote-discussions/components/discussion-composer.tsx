"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject,
} from "react";
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
  /** Persists the draft while the panel is closed, keyed by quote. */
  draftKey?: string;
  /** Grows from one to five rows instead of the default fixed three. */
  autoGrow?: boolean;
  /** Public panel shows "Posting as … · Change" instead of an always-open field. */
  nameFieldMode?: "always" | "collapsible";
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  onOptimisticMessage?: (message: { body: string; senderName: string }) => void;
  onSendSuccess?: () => void;
  onSendError?: (message?: string) => void;
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
  draftKey,
  autoGrow = false,
  nameFieldMode = "always",
  textareaRef,
  onOptimisticMessage,
  onSendSuccess,
  onSendError,
}: DiscussionComposerProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionStateWithSonner(action, {});
  const [body, setBody] = useState("");
  const [senderName, setSenderName] = useState(defaultName);
  const [isEditingName, setIsEditingName] = useState(false);
  const loadedDraftKeyRef = useRef<string | null>(null);
  const notifySendSuccess = useEffectEvent(() => {
    onSendSuccess?.();
  });
  const notifySendError = useEffectEvent((message?: string) => {
    onSendError?.(message);
  });
  const getDefaultName = useEffectEvent(() => defaultName);

  const bodyError = getFieldError(state.fieldErrors, "body");
  const nameError = getFieldError(state.fieldErrors, "senderName");
  const hasError = Boolean(state.error || bodyError || nameError);

  // Persist before loading so the first render does not overwrite a stored
  // draft with the empty initial values.
  useEffect(() => {
    if (!draftKey || loadedDraftKeyRef.current !== draftKey) {
      return;
    }

    try {
      if (body || senderName !== defaultName) {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ body, senderName }),
        );
      } else {
        window.localStorage.removeItem(draftKey);
      }
    } catch {
      // Private browsing and storage quotas are not composer errors.
    }
  }, [body, defaultName, draftKey, senderName]);

  useEffect(() => {
    if (!draftKey) {
      return;
    }

    try {
      const stored = window.localStorage.getItem(draftKey);

      if (stored) {
        const draft = JSON.parse(stored) as {
          body?: unknown;
          senderName?: unknown;
        };

        /* eslint-disable react-hooks/set-state-in-effect -- Hydrate the controlled fields once from the stored draft. */
        if (typeof draft.body === "string") {
          setBody(draft.body);
        }

        if (typeof draft.senderName === "string" && draft.senderName.trim()) {
          setSenderName(draft.senderName);
        }
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      // A missing or malformed draft must never block the composer.
    }

    loadedDraftKeyRef.current = draftKey;
  }, [draftKey]);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    // The fields are controlled, so clear them explicitly after a successful
    // send instead of relying on the browser's form reset.
    formRef.current?.reset();
    /* eslint-disable react-hooks/set-state-in-effect -- A confirmed send is the external event that resets the controlled fields. */
    setBody("");
    setSenderName(getDefaultName());
    setIsEditingName(false);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (draftKey) {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // The draft is a convenience, not a delivery guarantee.
      }
    }

    notifySendSuccess();
    router.refresh();
  }, [draftKey, router, state]);

  useEffect(() => {
    if (!hasError) {
      return;
    }

    notifySendError(state.error);
  }, [hasError, state]);

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const formData = new FormData(event.currentTarget);
    const nextBody = String(formData.get("body") ?? "").trim();
    const nextName = String(formData.get("senderName") ?? "").trim();

    if (nextBody && nextName) {
      onOptimisticMessage?.({ body: nextBody, senderName: nextName });
    }
  };

  const handleTextareaKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const nameInput = (
    <>
      <Input
        aria-describedby={nameError ? "discussion-sender-name-error" : undefined}
        aria-invalid={Boolean(nameError) || undefined}
        autoComplete="name"
        disabled={isPending}
        id="discussion-sender-name"
        maxLength={120}
        name="senderName"
        onChange={(event) => setSenderName(event.target.value)}
        placeholder="Maria Santos"
        value={senderName}
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
    </>
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      onSubmit={handleSubmit}
      ref={formRef}
    >
      {showNameField ? (
        nameFieldMode === "collapsible" ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>
                Posting as{" "}
                <span className="font-medium text-foreground">
                  {senderName.trim() || "you"}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <button
                className="font-medium text-primary-ink underline-offset-4 hover:underline"
                onClick={() => setIsEditingName((editing) => !editing)}
                type="button"
              >
                {isEditingName ? "Done" : "Change"}
              </button>
            </div>
            {isEditingName ? (
              <div className="flex flex-col gap-1.5">
                <label
                  className="sr-only"
                  htmlFor="discussion-sender-name"
                >
                  Display name
                </label>
                {nameInput}
              </div>
            ) : (
              <input name="senderName" type="hidden" value={senderName} />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label
              className="text-sm font-medium"
              htmlFor="discussion-sender-name"
            >
              Display name
            </label>
            {nameInput}
          </div>
        )
      ) : (
        <input name="senderName" type="hidden" value={senderName} />
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
          className={
            autoGrow
              ? "max-h-40 min-h-9 resize-none overflow-y-auto"
              : undefined
          }
          disabled={isPending}
          id="discussion-message-body"
          maxLength={quoteDiscussionMessageMaxLength}
          name="body"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
          placeholder={placeholder}
          ref={textareaRef}
          required
          rows={autoGrow ? 1 : 3}
          value={body}
        />
        {bodyError ? (
          <p
            className="text-xs text-destructive-ink"
            id="discussion-message-body-error"
          >
            {bodyError}
          </p>
        ) : null}
        {state.error ? (
          <p className="text-xs text-destructive-ink" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div>
            {hasError && !isPending ? (
              <Button
                onClick={() => formRef.current?.requestSubmit()}
                size="sm"
                type="button"
                variant="outline"
              >
                Retry
              </Button>
            ) : null}
          </div>
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
