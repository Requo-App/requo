import { MessageSquare } from "lucide-react";

import { DashboardEmptyState } from "@/components/shared/dashboard-layout";
import type { QuoteDiscussionMessageView } from "@/features/quote-discussions/types";
import { formatQuoteDiscussionTimestamp } from "@/features/quote-discussions/utils";
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
}: {
  messages: readonly QuoteDiscussionMessageView[];
  viewer: "customer" | "business";
  businessName: string;
  emptyTitle?: string;
  emptyDescription?: string;
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

        return (
          <li
            className={cn(
              "flex flex-col gap-1.5",
              isOwnMessage ? "items-end" : "items-start",
            )}
            key={message.id}
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
              <time dateTime={message.createdAt}>
                {formatQuoteDiscussionTimestamp(message.createdAt)}
              </time>
            </div>
            <div
              className={cn(
                "max-w-[85%] rounded-xl border px-4 py-3 text-sm leading-6 whitespace-pre-wrap",
                isOwnMessage
                  ? "border-primary/20 bg-primary/5 text-foreground"
                  : "border-border/60 bg-muted/40 text-foreground",
              )}
            >
              {message.body}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
