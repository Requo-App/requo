import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import {
  DashboardDetailHeader,
  DashboardDetailLayout,
  DashboardPage,
  DashboardSection,
  DashboardSidebarStack,
} from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBusinessQuotePath } from "@/features/businesses/routes";
import { DiscussionAutoRefresh } from "@/features/quote-discussions/components/discussion-auto-refresh";
import { DiscussionComposer } from "@/features/quote-discussions/components/discussion-composer";
import { DiscussionMessages } from "@/features/quote-discussions/components/discussion-messages";
import { DiscussionReadMarker } from "@/features/quote-discussions/components/discussion-read-marker";
import { QuoteDiscussionStateBadge } from "@/features/quote-discussions/components/discussion-state-badge";
import type {
  QuoteDiscussionActionState,
  QuoteDiscussionDetail,
} from "@/features/quote-discussions/types";
import { formatQuoteDate, formatQuoteMoney } from "@/features/quotes/utils";

export function BusinessDiscussionDetail({
  discussion,
  replyAction,
  senderName,
}: {
  discussion: QuoteDiscussionDetail;
  senderName: string;
  replyAction: (
    state: QuoteDiscussionActionState,
    formData: FormData,
  ) => Promise<QuoteDiscussionActionState>;
}) {
  const isArchived = discussion.state === "archived";

  return (
    <DashboardPage className="pb-24">
      <DiscussionAutoRefresh />
      <DiscussionReadMarker
        businessSlug={discussion.businessSlug}
        discussionId={discussion.id}
        lastMessageAt={discussion.lastMessageAt}
      />

      <DashboardDetailHeader
        actions={
          <Button asChild size="sm" variant="outline">
            <Link
              href={getBusinessQuotePath(
                discussion.businessSlug,
                discussion.quoteId,
              )}
            >
              View quote
              <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
            </Link>
          </Button>
        }
        description={`${discussion.customerName} · Quote ${discussion.quoteNumber}`}
        eyebrow="Quote discussion"
        meta={
          <>
            <QuoteDiscussionStateBadge state={discussion.state} />
            {discussion.unreadCount > 0 ? (
              <Badge variant="secondary">
                {discussion.unreadCount} unread
              </Badge>
            ) : null}
          </>
        }
        title={discussion.customerName}
      />

      <DashboardDetailLayout className="xl:grid-cols-[minmax(0,1.2fr)_0.8fr]">
        <DashboardSection
          description={`Conversation attached to quote ${discussion.quoteNumber}.`}
          title="Conversation"
        >
          <div className="flex flex-col gap-6">
            <DiscussionMessages
              businessName={discussion.businessName}
              emptyDescription="This conversation has no messages yet."
              messages={discussion.messages}
              viewer="business"
            />

            <div className="border-t border-border/60 pt-5">
              <DiscussionComposer
                action={replyAction}
                defaultName={senderName}
                disabled={isArchived}
                disabledDescription="This quote is closed, so the conversation is read-only. The full message history remains available."
                disabledTitle="Discussion archived"
                placeholder="Reply to the customer…"
                showNameField={false}
                submitLabel="Send reply"
              />
            </div>
          </div>
        </DashboardSection>

        <DashboardSidebarStack>
          <DashboardSection
            description="The conversation always belongs to exactly one quote."
            title="Quote context"
          >
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Quote</dt>
                <dd className="font-medium text-foreground">
                  {discussion.quoteNumber}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-medium text-foreground">
                  {formatQuoteMoney(
                    discussion.quoteTotalInCents,
                    discussion.currency,
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Valid until</dt>
                <dd className="font-medium text-foreground">
                  {formatQuoteDate(discussion.validUntil)}
                </dd>
              </div>
              {discussion.customerEmail ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Customer email</dt>
                  <dd className="min-w-0 truncate font-medium text-foreground">
                    {discussion.customerEmail}
                  </dd>
                </div>
              ) : null}
            </dl>

            <Button asChild className="mt-4 w-full" variant="outline">
              <Link
                href={getBusinessQuotePath(
                  discussion.businessSlug,
                  discussion.quoteId,
                )}
              >
                Open quote {discussion.quoteNumber}
              </Link>
            </Button>
          </DashboardSection>
        </DashboardSidebarStack>
      </DashboardDetailLayout>
    </DashboardPage>
  );
}
