import Link from "next/link";
import { MessageSquare } from "lucide-react";

import {
  DashboardEmptyState,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getBusinessDiscussionPath } from "@/features/businesses/routes";
import { QuoteDiscussionStateBadge } from "@/features/quote-discussions/components/discussion-state-badge";
import { getQuoteDiscussionForQuoteForBusiness } from "@/features/quote-discussions/queries";
import {
  formatQuoteDiscussionTimestamp,
  getQuoteDiscussionPreview,
} from "@/features/quote-discussions/utils";

/**
 * The same thread the inbox opens. This section is a contextual entry point,
 * not a second conversation or an independent read state.
 */
export async function QuoteDetailDiscussionSection({
  businessId,
  businessSlug,
  quoteId,
}: {
  businessId: string;
  businessSlug: string;
  quoteId: string;
}) {
  const user = await requireUser();
  const discussion = await getQuoteDiscussionForQuoteForBusiness({
    businessId,
    quoteId,
    userId: user.id,
  });

  if (!discussion) {
    return (
      <DashboardSection
        description="When the customer asks a question on the public quote link, it appears here."
        title="Discussion"
      >
        <DashboardEmptyState
          description="No messages yet. The customer can start a conversation from the quote link."
          icon={MessageSquare}
          title="No discussion yet"
          variant="section"
        />
      </DashboardSection>
    );
  }

  return (
    <DashboardSection
      action={<QuoteDiscussionStateBadge state={discussion.state} />}
      description="Questions and replies attached to this quote. Opens the same conversation as the Discussions inbox."
      title="Discussion"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {discussion.unreadCount > 0 ? (
            <Badge variant="secondary">{discussion.unreadCount} unread</Badge>
          ) : null}
          {discussion.lastMessage ? (
            <span className="text-xs text-muted-foreground">
              Last activity {formatQuoteDiscussionTimestamp(discussion.lastMessageAt)}
            </span>
          ) : null}
        </div>

        {discussion.lastMessage ? (
          <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium text-foreground">
              {discussion.lastMessage.senderName}
            </p>
            <p className="mt-1 text-sm leading-5 whitespace-pre-wrap text-muted-foreground">
              {getQuoteDiscussionPreview(discussion.lastMessage.body, 220)}
            </p>
          </div>
        ) : null}

        <Button asChild className="w-full" variant="outline">
          <Link href={getBusinessDiscussionPath(businessSlug, discussion.id)}>
            <MessageSquare aria-hidden="true" data-icon="inline-start" />
            {discussion.unreadCount > 0
              ? `Open discussion (${discussion.unreadCount} unread)`
              : "Open discussion"}
          </Link>
        </Button>
      </div>
    </DashboardSection>
  );
}
