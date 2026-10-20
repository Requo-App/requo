import { BusinessAvatar } from "@/components/shared/business-avatar";
import type { ReactNode } from "react";

import {
  PublicHeroSurface,
  PublicPageShell,
} from "@/components/shared/public-page-shell";
import { MadeWithRequo } from "@/components/shared/made-with-requo";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import { formatQuoteDate, formatQuoteMoney } from "@/features/quotes/utils";
import type { PublicQuoteView } from "@/features/quotes/types";
import type { BusinessPlan } from "@/lib/plans/plans";

type PublicQuotePageRendererProps = {
  quote: PublicQuoteView;
  businessPlan: BusinessPlan;
  headerAction?: ReactNode;
  beforeContent?: ReactNode;
  interactiveColumn: ReactNode;
  afterContent?: ReactNode;
  /**
   * When true, the public Requo top bar (brand + header action) is omitted.
   * The free-tier "Made with Requo" watermark still renders below the content.
   */
  hideHeader?: boolean;
};

/**
 * Shared renderer for the public quote page layout.
 * Used by both the real public quote page and the business-side preview page.
 */
export function PublicQuotePageRenderer({
  quote,
  businessPlan,
  headerAction,
  beforeContent,
  interactiveColumn,
  afterContent,
  hideHeader = false,
}: PublicQuotePageRendererProps) {
  const showWatermark = !hasFeatureAccess(businessPlan, "removeWatermark");

  const content = (
    <QuotePageContent quote={quote} interactiveColumn={interactiveColumn} />
  );

  if (hideHeader || !headerAction) {
    return (
      <>
        {beforeContent}

        <div className="public-page">
          <div className="public-page-stack">
            <main className="contents">{content}</main>
          </div>
        </div>

        {showWatermark ? <MadeWithRequo /> : null}

        {afterContent}
      </>
    );
  }

  return (
    <>
      {beforeContent}

      <PublicPageShell
        headerAction={headerAction}
        headerClassName="border-transparent bg-transparent [&::before]:opacity-0"
      >
        {content}

        {showWatermark ? <MadeWithRequo /> : null}
      </PublicPageShell>

      {afterContent}
    </>
  );
}

function QuotePageContent({
  quote,
  interactiveColumn,
}: {
  quote: PublicQuoteView;
  interactiveColumn: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      {/* Left card — Quote content */}
      <PublicHeroSurface className="py-6 sm:py-8 lg:py-10">
        <div className="px-4 sm:px-6 lg:px-8">
          {/* Header: Business + Quote title */}
          <header className="flex flex-col gap-5 pb-6 sm:pb-8">
            <div className="flex items-center gap-3">
              <BusinessAvatar
                name={quote.businessName}
                logoUrl={
                  quote.businessLogoStoragePath && quote.businessSlug
                    ? `/api/business/${quote.businessSlug}/logo`
                    : null
                }
                size="sm"
              />
              <span className="text-sm font-medium text-muted-foreground">
                {quote.businessName}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {quote.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                For {quote.customerName} · {quote.quoteNumber}
                {quote.version > 1 ? ` · v${quote.version}` : ""} · Valid until{" "}
                {formatQuoteDate(quote.validUntil)}
              </p>
            </div>
          </header>

          {/* Line items */}
          <div className="flex flex-col divide-y divide-border/50 border-t border-border/60 py-2">
            {quote.items.map((item) => (
              <div
                className="flex items-start justify-between gap-4 py-4"
                key={item.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.description}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.quantity} ×{" "}
                    {formatQuoteMoney(item.unitPriceInCents, quote.currency)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-foreground">
                  {formatQuoteMoney(item.lineTotalInCents, quote.currency)}
                </p>
              </div>
            ))}
          </div>

          {/* Subtotals */}
          <div className="flex flex-col gap-2 border-t border-border/60 pt-4 pb-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground">
                {formatQuoteMoney(quote.subtotalInCents, quote.currency)}
              </span>
            </div>
            {quote.discountInCents > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-foreground">
                  -{formatQuoteMoney(quote.discountInCents, quote.currency)}
                </span>
              </div>
            ) : null}
            {quote.taxInCents > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {quote.taxLabel ? `Tax (${quote.taxLabel})` : "Tax"}
                </span>
                <span className="text-foreground">
                  {formatQuoteMoney(quote.taxInCents, quote.currency)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-t border-border/40 pt-2 text-base font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">
                {formatQuoteMoney(quote.totalInCents, quote.currency)}
              </span>
            </div>
          </div>

          {/* Terms & conditions */}
          {quote.terms ? (
            <div className="mt-4 rounded-xl border border-border/50 px-4 py-4 sm:px-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Terms & conditions
              </p>
              <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {quote.terms}
              </p>
            </div>
          ) : null}

          {/* Notes */}
          {quote.notes ? (
            <div className="mt-4 rounded-xl border border-border/50 px-4 py-4 sm:px-5">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Notes
              </p>
              <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {quote.notes}
              </p>
            </div>
          ) : null}
        </div>
      </PublicHeroSurface>

      {/* Right column — Interactive actions */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        {interactiveColumn}
      </aside>
    </div>
  );
}
