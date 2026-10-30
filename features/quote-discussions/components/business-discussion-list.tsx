import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { DashboardEmptyState } from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { getBusinessDiscussionPath } from "@/features/businesses/routes";
import { QuoteDiscussionStateBadge } from "@/features/quote-discussions/components/discussion-state-badge";
import type {
  QuoteDiscussionSummary,
  QuoteDiscussionView,
} from "@/features/quote-discussions/types";
import {
  formatQuoteDiscussionTimestamp,
  getQuoteDiscussionPreview,
} from "@/features/quote-discussions/utils";
import { formatQuoteMoney } from "@/features/quotes/utils";

const emptyCopy: Record<
  QuoteDiscussionView,
  { title: string; description: string }
> = {
  needs_reply: {
    title: "No conversations need a reply",
    description:
      "When a customer asks a question about a quote, it will appear here.",
  },
  waiting_for_customer: {
    title: "No conversations are waiting on a customer",
    description:
      "Replies you send from a quote discussion will wait here until the customer writes back.",
  },
  archived: {
    title: "No archived discussions",
    description:
      "Discussions move here when their quote is accepted, declined, expired, or voided.",
  },
};

export function BusinessDiscussionList({
  items,
  businessSlug,
  view,
}: {
  items: readonly QuoteDiscussionSummary[];
  businessSlug: string;
  view: QuoteDiscussionView;
}) {
  if (items.length === 0) {
    const copy = emptyCopy[view];

    return (
      <DashboardEmptyState
        description={copy.description}
        icon={MessageSquare}
        title={copy.title}
        variant="page"
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
            href={getBusinessDiscussionPath(businessSlug, item.id)}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {item.customerName}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {item.quoteNumber} ·{" "}
                  {formatQuoteMoney(item.quoteTotalInCents, item.currency)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.unreadCount > 0 ? (
                  <Badge variant="default">
                    {item.unreadCount} new
                  </Badge>
                ) : null}
                <QuoteDiscussionStateBadge state={item.state} />
              </div>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
                {item.lastMessage ? (
                  <>
                    <span className="font-medium text-foreground">
                      {item.lastMessage.senderName}:
                    </span>{" "}
                    {getQuoteDiscussionPreview(item.lastMessage.body)}
                  </>
                ) : (
                  "No messages yet."
                )}
              </p>
              <time
                className="shrink-0 text-xs text-muted-foreground"
                dateTime={item.lastMessageAt}
              >
                {formatQuoteDiscussionTimestamp(item.lastMessageAt)}
              </time>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
