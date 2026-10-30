import { MessageSquare } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DiscussionAutoRefresh } from "@/features/quote-discussions/components/discussion-auto-refresh";
import { DiscussionComposer } from "@/features/quote-discussions/components/discussion-composer";
import { DiscussionMessages } from "@/features/quote-discussions/components/discussion-messages";
import type {
  PublicQuoteDiscussionView,
  QuoteDiscussionActionState,
} from "@/features/quote-discussions/types";

export function PublicQuoteDiscussion({
  discussion,
  action,
}: {
  discussion: PublicQuoteDiscussionView;
  action: (
    state: QuoteDiscussionActionState,
    formData: FormData,
  ) => Promise<QuoteDiscussionActionState>;
}) {
  return (
    <Card
      aria-labelledby="public-quote-discussion-title"
      className="gap-0"
      id="discussion"
    >
      <CardHeader className="gap-2 pb-4">
        <CardTitle>
          <span className="flex items-center gap-2">
            <MessageSquare aria-hidden="true" className="size-4 text-primary-ink" />
            Questions about this quote?
          </span>
        </CardTitle>
        <CardDescription>
          Ask {discussion.businessName} about scope, pricing, or timing. This is
          not an acceptance of the quote.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 pt-0">
        <DiscussionAutoRefresh />
        <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          Anyone with this quote link can read this conversation and send
          messages. Display names are not verified, so use the quote link only
          with people you trust.
        </p>

        <DiscussionMessages
          businessName={discussion.businessName}
          emptyDescription={`Ask ${discussion.businessName} anything about the work, pricing, or terms. Replies stay attached to quote ${discussion.quoteNumber}.`}
          emptyTitle="Start the conversation"
          messages={discussion.messages}
          viewer="customer"
        />

        <DiscussionComposer
          action={action}
          defaultName={discussion.suggestedName}
          disabled={discussion.closed}
          disabledDescription={
            discussion.closed
              ? "This quote is closed, so the discussion is now read-only. The message history is still available above."
              : undefined
          }
          placeholder="Ask a question about this quote…"
          showNameField
          submitLabel="Send question"
        />
      </CardContent>
    </Card>
  );
}
