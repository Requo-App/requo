"use client";

import Link from "next/link";
import { ChevronDown, Eye, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import { formatQuoteMoney } from "@/features/quotes/utils";
import {
  getBusinessNewQuotePath,
  getBusinessQuotePath,
} from "@/features/businesses/routes";
import { formatInquiryDate } from "@/features/inquiries/utils";
import type { DashboardInquiryRelatedQuotes } from "@/features/inquiries/types";

type InquiryQuoteActionsProps = {
  businessSlug: string;
  relatedQuotes: DashboardInquiryRelatedQuotes;
  canGenerateQuote: boolean;
  inquiryId: string;
  currency?: string;
};

export function InquiryQuoteActions({
  businessSlug,
  relatedQuotes,
  canGenerateQuote,
  inquiryId,
  currency,
}: InquiryQuoteActionsProps) {
  if (relatedQuotes.count === 1) {
    // Single quote: single "View quote" primary. "Generate quote" renders as
    // the header secondary / lives in "More actions", so no split chevron.
    return (
      <Button
        asChild
        aria-label="View quote"
        title="View quote"
        size="sm"
        className={mobileNavbarIconButtonClassName}
      >
        <Link
          href={getBusinessQuotePath(businessSlug, relatedQuotes.latest.id)}
        >
          <Eye data-icon="inline-start" />
          <span className="hidden lg:inline">View quote</span>
        </Link>
      </Button>
    );
  }

  // Multiple quotes: "View quotes (N)" button with dropdown listing all quotes
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`View quotes (${relatedQuotes.count})`}
          title={`View quotes (${relatedQuotes.count})`}
          size="sm"
          className={mobileNavbarIconButtonClassName}
        >
          <Eye data-icon="inline-start" />
          <span className="hidden lg:inline">
            View quotes ({relatedQuotes.count})
          </span>
          <ChevronDown
            className="ml-1 size-3.5 max-lg:hidden"
            data-icon="inline-end"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {relatedQuotes.all.map((quote) => (
          <DropdownMenuItem key={quote.id} asChild>
            <Link
              href={getBusinessQuotePath(businessSlug, quote.id)}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium truncate">
                  {quote.quoteNumber}
                </span>
                <span className="text-xs text-muted-foreground">
                  {currency
                    ? formatQuoteMoney(quote.totalInCents, currency)
                    : null}
                  {currency ? " · " : null}
                  {formatInquiryDate(quote.createdAt)}
                </span>
              </div>
              <QuoteStatusBadge status={quote.status} />
            </Link>
          </DropdownMenuItem>
        ))}
        {canGenerateQuote ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={getBusinessNewQuotePath(businessSlug, inquiryId)}>
                <Plus className="size-4" />
                Create new quote
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
