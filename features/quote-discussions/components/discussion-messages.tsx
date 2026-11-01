import { MessageSquare } from "lucide-react";

import { BusinessAvatar } from "@/components/shared/business-avatar";
import { DashboardEmptyState } from "@/components/shared/dashboard-layout";
import type { QuoteDiscussionMessageView } from "@/features/quote-discussions/types";
import {
  formatQuoteDiscussionRelativeTimestamp,
  formatQuoteDiscussionTimestamp,
} from "@/features/quote-discussions/utils";
import { cn } from "@/lib/utils";

/**
 * Viewer is relative to the two sides: the customer sees their own messages
 * on the right and the business on the left, while the business sees the
 * inverse. The same thread data drives both views.
 */
export function DiscussionMessages({
  messages,
  viewer,
  businessName,
  emptyTitle = "No messages yet",
  emptyDescription = "Questions and replies will appear here.",
  showAvatars = false,
  timestampFormat = "absolute",
}: {
  messages: readonly QuoteDiscussionMessageView[];
  viewer: "customer" | "business";
  businessName: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Chat-panel presentation: business replies carry the business avatar. */
  showAvatars?: boolean;
  timestampFormat?: "absolute" | "relative";
}) {
  if (messages.length === 0) {
    return (
      <DashboardEmptyState
        description={emptyDescription}
        icon={MessageSquare}
        title={emptyTitle}
        variant="flat"
      />
    );
  }

  return (
    <ol
      aria-label="Discussion messages"
      className="flex flex-col gap-4"
    >
      {messages.map((message) => {
        const isOwnMessage =
          viewer === "customer"
            ? message.senderType === "customer"
            : message.senderType === "business";
        const timestamp =
          timestampFormat === "relative"
            ? formatQuoteDiscussionRelativeTimestamp(message.createdAt)
            : formatQuoteDiscussionTimestamp(message.createdAt);

        return (
          <li
            className={cn(
              "flex w-full flex-col gap-1.5",
              isOwnMessage ? "items-end" : "items-start",
            )}
            key={message.id}
          >
            <div
              className={cn(
                "flex w-full gap-2",
                isOwnMessage ? "justify-end" : "justify-start",
              )}
            >
              {!isOwnMessage && showAvatars ? (
                <BusinessAvatar
                  className="mt-0.5 shrink-0"
                  name={businessName}
                  size="sm"
                />
              ) : null}
              <div
                className={cn(
                  "flex max-w-[85%] flex-col gap-1.5",
                  isOwnMessage ? "items-end" : "items-start",
                )}
              >
                <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {message.senderType === "business"
                      ? message.senderName || businessName
                      : message.senderName}
                  </span>
                  {message.senderType === "business" ? (
                    <span className="meta-label">Business</span>
                  ) : (
                    <span className="meta-label">Customer</span>
                  )}
                  <time
                    dateTime={message.createdAt}
                    title={formatQuoteDiscussionTimestamp(message.createdAt)}
                  >
                    {timestamp}
                  </time>
                </div>
                <div
                  className={cn(
                    "max-w-full rounded-xl border px-4 py-3 text-sm leading-6 whitespace-pre-wrap",
                    isOwnMessage
                      ? "border-primary/20 bg-primary/5 text-foreground"
                      : "border-border/60 bg-muted/40 text-foreground",
                  )}
                >
                  {message.body}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
