"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Mail, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHydrated } from "@/hooks/use-hydrated";
import { useIsMobile } from "@/hooks/use-mobile";
import { DiscussionAutoRefresh } from "@/features/quote-discussions/components/discussion-auto-refresh";
import { DiscussionComposer } from "@/features/quote-discussions/components/discussion-composer";
import { DiscussionMessages } from "@/features/quote-discussions/components/discussion-messages";
import type {
  PublicQuoteDiscussionView,
  QuoteDiscussionActionState,
  QuoteDiscussionMessageView,
} from "@/features/quote-discussions/types";

const discussionSeenStoragePrefix = "requo:quote-discussion-seen:";
const discussionDraftStoragePrefix = "requo:quote-discussion-draft:";
const discussionSeenStorageEvent = "requo:quote-discussion-seen-change";

function getDiscussionStorageScope(businessName: string, quoteNumber: string) {
  // Quote numbers are unique per business, not across the public origin, so the
  // business name keeps two quotes with the same number from sharing a badge or
  // draft.
  return `${businessName}:${quoteNumber}`;
}

function getDiscussionSeenStorageKey(businessName: string, quoteNumber: string) {
  return `${discussionSeenStoragePrefix}${getDiscussionStorageScope(businessName, quoteNumber)}`;
}

function getDiscussionDraftStorageKey(
  businessName: string,
  quoteNumber: string,
) {
  return `${discussionDraftStoragePrefix}${getDiscussionStorageScope(businessName, quoteNumber)}`;
}

function subscribeToDiscussionSeenStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(discussionSeenStorageEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(discussionSeenStorageEvent, onStoreChange);
  };
}

function readDiscussionSeenAt(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function PublicQuoteDiscussion({
  discussion,
  action,
  businessContactEmail,
}: {
  discussion: PublicQuoteDiscussionView;
  action: (
    state: QuoteDiscussionActionState,
    formData: FormData,
  ) => Promise<QuoteDiscussionActionState>;
  businessContactEmail?: string | null;
}) {
  const isMobile = useIsMobile();
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [optimisticMessage, setOptimisticMessage] = useState<{
    message: QuoteDiscussionMessageView;
    existingMessageIds: readonly string[];
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const seenStorageKey = getDiscussionSeenStorageKey(
    discussion.businessName,
    discussion.quoteNumber,
  );
  const lastSeenAt = useSyncExternalStore(
    subscribeToDiscussionSeenStorage,
    () => readDiscussionSeenAt(seenStorageKey),
    () => null,
  );

  const latestMessageAt = discussion.messages.at(-1)?.createdAt ?? null;
  const latestBusinessMessage = [...discussion.messages]
    .reverse()
    .find((message) => message.senderType === "business");
  const hasNewBusinessReply = Boolean(
    hydrated &&
      latestBusinessMessage &&
      (!lastSeenAt || latestBusinessMessage.createdAt > lastSeenAt),
  );

  useEffect(() => {
    if (!open || !latestMessageAt) {
      return;
    }

    try {
      window.localStorage.setItem(seenStorageKey, latestMessageAt);
      window.dispatchEvent(new Event(discussionSeenStorageEvent));
    } catch {
      // A missing or blocked localStorage entry only affects the badge.
    }
  }, [latestMessageAt, open, seenStorageKey]);

  useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#discussion") {
        setOpen(true);
      }
    };

    openFromHash();
    window.addEventListener("hashchange", openFromHash);

    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  // The shared SheetOverlay is a plain div, so Radix never installs its
  // RemoveScroll lock. Lock both roots here and release them as soon as the
  // panel starts closing, matching the other full-screen overlays in the app.
  // Compensating for the removed scrollbar keeps the centered page still.
  useEffect(() => {
    if (!open) {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousRootScrollbarGutter = root.style.scrollbarGutter;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - body.clientWidth;

    root.style.overflow = "hidden";
    // The app reserves a stable scrollbar gutter on the root. Give that space
    // back while the panel is open so the overlay covers the full viewport,
    // then pad the body by the same amount to keep the page from shifting.
    root.style.scrollbarGutter = "auto";
    body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      const bodyPaddingRight =
        Number.parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${bodyPaddingRight + scrollbarWidth}px`;
    }

    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.scrollbarGutter = previousRootScrollbarGutter;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const thread = threadScrollRef.current;

    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }, [latestMessageAt, open, optimisticMessage?.message.id]);

  const handleOptimisticMessage = useCallback(
    ({ body, senderName }: { body: string; senderName: string }) => {
      setOptimisticMessage({
        message: {
          id: `optimistic-${Date.now()}`,
          senderType: "customer",
          senderName,
          body,
          createdAt: new Date().toISOString(),
        },
        existingMessageIds: discussion.messages.map((message) => message.id),
      });
    },
    [discussion.messages],
  );

  const handleSendError = useCallback(() => {
    setOptimisticMessage(null);
  }, []);

  const handleOpenAutoFocus = (event: Event) => {
    if (!textareaRef.current) {
      return;
    }

    event.preventDefault();
    // The panel animates in from off-screen; focusing without this would make
    // the browser scroll the page underneath the sheet.
    textareaRef.current.focus({ preventScroll: true });
  };

  const pendingOptimisticMessage =
    optimisticMessage &&
    !discussion.messages.some(
      (message) =>
        !optimisticMessage.existingMessageIds.includes(message.id) &&
        message.senderType === "customer" &&
        message.body === optimisticMessage.message.body,
    )
      ? optimisticMessage.message
      : null;
  const messages = pendingOptimisticMessage
    ? [...discussion.messages, pendingOptimisticMessage]
    : discussion.messages;
  const messageCount = discussion.messages.length;
  const triggerLabel =
    messageCount === 0
      ? "Questions"
      : hasNewBusinessReply
        ? `Questions, ${messageCount} messages, new reply from business`
        : `Questions, ${messageCount} messages`;

  return (
    <>
      <DiscussionAutoRefresh />
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger asChild>
          <Button
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={triggerLabel}
            className="w-full shrink-0 sm:w-auto"
            id="discussion"
            size="sm"
            variant="outline"
          >
            <MessageSquare data-icon="inline-start" className="size-3.5" />
            Questions
            {messageCount > 0 ? (
              hasNewBusinessReply ? (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-primary"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="rounded-full bg-muted px-1.5 text-[10px] font-semibold leading-4 text-muted-foreground"
                >
                  {messageCount > 99 ? "99+" : messageCount}
                </span>
              )
            ) : null}
          </Button>
        </SheetTrigger>

        <SheetContent
          aria-modal="true"
          className="data-[side=bottom]:h-[90dvh] data-[side=bottom]:w-screen data-[side=right]:lg:w-[420px] data-[side=right]:lg:max-w-[420px]"
          onOpenAutoFocus={handleOpenAutoFocus}
          side={isMobile ? "bottom" : "right"}
        >
          <SheetHeader>
            <SheetTitle>Questions</SheetTitle>
            <SheetDescription>
              Quote {discussion.quoteNumber} · {discussion.businessName}
            </SheetDescription>
            <p className="text-xs leading-5 text-muted-foreground">
              This is not an acceptance of the quote.
            </p>
          </SheetHeader>

          <SheetBody className="gap-4" ref={threadScrollRef}>
            <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
              Anyone with this quote link can read this conversation and send
              messages. Display names are not verified, so use the quote link
              only with people you trust.
            </p>

            <DiscussionMessages
              businessName={discussion.businessName}
              emptyDescription={`Ask ${discussion.businessName} anything about the work, pricing, or terms. Replies stay attached to quote ${discussion.quoteNumber}.`}
              emptyTitle="Start the conversation"
              messages={messages}
              showAvatars
              timestampFormat="relative"
              viewer="customer"
            />
          </SheetBody>

          <div className="shrink-0 border-t border-[var(--overlay-divider)] px-5 py-4 sm:px-6">
            <DiscussionComposer
              action={action}
              autoGrow
              defaultName={discussion.suggestedName}
              disabled={discussion.closed}
              disabledDescription={
                discussion.closed
                  ? "This quote is closed, so the discussion is now read-only. The message history is still available above."
                  : undefined
              }
              draftKey={getDiscussionDraftStorageKey(
                discussion.businessName,
                discussion.quoteNumber,
              )}
              nameFieldMode="collapsible"
              onOptimisticMessage={handleOptimisticMessage}
              onSendError={handleSendError}
              placeholder="Ask a question about this quote…"
              showNameField
              submitLabel="Send"
              textareaRef={textareaRef}
            />

            {businessContactEmail ? (
              <div className="mt-3 border-t border-border/50 pt-3">
                <a
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  href={`mailto:${businessContactEmail}`}
                >
                  <Mail aria-hidden="true" className="size-3.5" />
                  Prefer email? Email {discussion.businessName}
                </a>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
