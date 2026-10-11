import type { ItemRefCallback, MotionState } from "@/hooks/use-animated-list";
import { Badge } from "@/components/ui/badge";
import { MobileRecordRow } from "@/components/shared/mobile-record-row";
import { QuoteRecordStateBadge } from "@/features/quotes/components/quote-record-state-badge";
import { QuoteReminderBadge } from "@/features/quotes/components/quote-reminder-badge";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import {
  formatQuoteDate,
  formatQuoteMoney,
} from "@/features/quotes/utils";
import { getBusinessQuotePath } from "@/features/businesses/routes";
import type { DashboardQuoteListItem } from "@/features/quotes/types";

type QuoteListCardsProps = {
  quotes: DashboardQuoteListItem[];
  businessSlug: string;
  isSelected?: (id: string) => boolean;
  isAtLimit?: boolean;
  onToggle?: (id: string) => void;
  getMotionState?: (id: string) => MotionState;
  getItemRef?: ItemRefCallback;
};

export function QuoteListCards({
  quotes,
  businessSlug,
  isSelected,
  isAtLimit,
  onToggle,
  getMotionState,
  getItemRef,
}: QuoteListCardsProps) {
  return (
    <div className="flex flex-col gap-2.5 p-4 xl:hidden">
      {quotes.map((quote) => {
        const reminders = quote.reminders.filter(
          (reminder) => reminder !== "follow_up_due",
        );
        const checked = isSelected?.(quote.id) ?? false;
        const disabled = !checked && (isAtLimit ?? false);
        const viewedNoResponse = isViewedWithoutResponse(quote);

        return (
          <MobileRecordRow
            key={quote.id}
            id={quote.id}
            href={getBusinessQuotePath(businessSlug, quote.id)}
            isSelected={checked}
            isSelectionDisabled={disabled}
            onToggleSelect={onToggle}
            motionState={getMotionState?.(quote.id)}
            itemRef={getItemRef?.(quote.id)}
            title={
              <span className="truncate">
                {quote.quoteNumber} <span className="text-muted-foreground font-normal">· {quote.title}</span>
              </span>
            }
            subtitle={
              <span className="truncate">
                {quote.customerName}
                {quote.customerEmail ? ` (${quote.customerEmail})` : ""}
              </span>
            }
            statusBadge={<QuoteStatusBadge status={quote.status} />}
            stateBadge={
              quote.archivedAt ? (
                <QuoteRecordStateBadge state="archived" />
              ) : null
            }
            metadata={
              <>
                <span className="font-semibold text-foreground">
                  {formatQuoteMoney(quote.totalInCents, quote.currency)}
                </span>
                <span aria-hidden="true" className="text-muted-foreground/40">·</span>
                <span>Valid until {formatQuoteDate(quote.validUntil)}</span>
                {reminders.length > 0 ? (
                  <>
                    <span aria-hidden="true" className="text-muted-foreground/40">·</span>
                    <QuoteReminderBadge kind={reminders[0]} />
                  </>
                ) : viewedNoResponse ? (
                  <>
                    <span aria-hidden="true" className="text-muted-foreground/40">·</span>
                    <Badge variant="secondary">
                      Viewed
                    </Badge>
                  </>
                ) : null}
              </>
            }
          />
        );
      })}
    </div>
  );
}

function isViewedWithoutResponse(quote: DashboardQuoteListItem) {
  return Boolean(
    quote.status === "sent" &&
      quote.publicViewedAt &&
    !quote.customerRespondedAt,
  );
}
