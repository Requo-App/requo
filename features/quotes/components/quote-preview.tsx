import { BusinessAvatar } from "@/components/shared/business-avatar";
import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import { cn } from "@/lib/utils";
import { formatQuoteDate, formatQuoteMoney } from "@/features/quotes/utils";

type QuotePreviewItem = {
  id: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
};

type QuotePreviewProps = {
  businessName: string;
  quoteNumber: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  currency: string;
  validUntil: string;
  notes?: string | null;
  terms?: string | null;
  items: QuotePreviewItem[];
  subtotalInCents: number;
  discountInCents: number;
  taxInCents?: number;
  taxLabel?: string | null;
  totalInCents: number;
  metaLabel?: string;
  businessLogoStoragePath?: string | null;
  businessSlug?: string;
  className?: string;
  titleLevel?: 1 | 2;
  variant?: "default" | "bare";
};

export function QuotePreview({
  businessName,
  quoteNumber,
  title,
  customerName,
  customerEmail,
  currency,
  validUntil,
  notes,
  terms,
  items,
  subtotalInCents,
  discountInCents,
  taxInCents = 0,
  taxLabel,
  totalInCents,
  metaLabel: _metaLabel = "Quote preview",
  businessLogoStoragePath,
  businessSlug,
  className,
  titleLevel = 2,
  variant = "default",
}: QuotePreviewProps) {
  const TitleTag = titleLevel === 1 ? "h1" : "h2";
  const logoUrl =
    businessLogoStoragePath && businessSlug
      ? `/api/business/${businessSlug}/logo`
      : null;

  return (
    <article
      data-padding="none"
      className={cn(
        "overflow-hidden",
        variant === "default" && "section-panel p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <BusinessAvatar name={businessName} logoUrl={logoUrl} />
                <span className="font-semibold text-foreground text-lg tracking-tight">
                  <TruncatedTextWithTooltip text={businessName} />
                </span>
              </div>
              <TitleTag className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl mt-1">
                <TruncatedTextWithTooltip text={title} lines={2} />
              </TitleTag>
            </div>
            <div data-padding="none" className="soft-panel w-full px-4 py-3 text-sm shadow-none sm:w-auto sm:min-w-52">
              <TruncatedTextWithTooltip
                className="text-sm font-semibold text-foreground"
                text={quoteNumber}
              />
              <p className="mt-1 text-muted-foreground">
                Valid until {formatQuoteDate(validUntil)}
              </p>
            </div>
          </div>

          <div className="info-tile min-w-0 h-full shadow-none">
            <p className="meta-label">Prepared for</p>
            <TruncatedTextWithTooltip
              className="mt-2 font-medium text-foreground"
              text={customerName}
            />
            {customerEmail ? (
              <TruncatedTextWithTooltip
                className="mt-1 text-sm text-muted-foreground"
                text={customerEmail}
              />
            ) : null}
          </div>
        </div>

        <div className="@container/qtable @2xl/qtable:overflow-hidden @2xl/qtable:rounded-xl @2xl/qtable:border @2xl/qtable:border-border/75 @2xl/qtable:bg-card">
          <div className="flex flex-col @2xl/qtable:hidden">
            {items.length ? (
              items.map((item) => (
                <div
                  className="flex flex-col gap-1.5 border-b border-border/60 p-4 last:border-0"
                  key={item.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">
                      <TruncatedTextWithTooltip
                        lines={3}
                        text={item.description || "Untitled item"}
                      />
                    </div>
                    <div className="shrink-0 text-right text-sm font-medium text-foreground">
                      {formatQuoteMoney(item.lineTotalInCents, currency)}
                    </div>
                  </div>
                  <div className="flex justify-between text-[0.82rem] text-muted-foreground">
                    <div>
                      {item.quantity} × {formatQuoteMoney(item.unitPriceInCents, currency)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Add line items to preview the quote breakdown.
              </div>
            )}
          </div>

          <div className="hidden @2xl/qtable:block">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/22 text-left">
                <tr>
                  <th className="px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Item
                  </th>
                  <th className="px-4 py-3 text-center text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-right text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Unit price
                  </th>
                  <th className="px-4 py-3 text-right text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Line total
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((item) => (
                    <tr className="border-t border-border/75" key={item.id}>
                      <td className="max-w-0 px-4 py-3 align-top text-foreground">
                        <TruncatedTextWithTooltip
                          lines={2}
                          text={item.description || "Untitled item"}
                        />
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatQuoteMoney(item.unitPriceInCents, currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatQuoteMoney(item.lineTotalInCents, currency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-muted-foreground"
                      colSpan={4}
                    >
                      Add line items to preview the quote breakdown.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="soft-panel flex w-full flex-col gap-3 shadow-none">
          <p className="meta-label">Summary</p>
          <SummaryRow
            label="Subtotal"
            value={formatQuoteMoney(subtotalInCents, currency)}
          />
          <SummaryRow
            label="Discount"
            value={`-${formatQuoteMoney(discountInCents, currency)}`}
          />
          <SummaryRow
            label={taxLabel ? `Tax (${taxLabel})` : "Tax"}
            value={formatQuoteMoney(taxInCents, currency)}
          />
          <div className="border-t pt-3">
            <SummaryRow
              label="Total"
              value={formatQuoteMoney(totalInCents, currency)}
              strong
            />
          </div>
        </div>

        {terms ? (
          <div className="soft-panel shadow-none">
            <p className="meta-label">Terms & conditions</p>
            <TruncatedTextWithTooltip
              className="mt-3 whitespace-pre-wrap text-xs leading-normal sm:leading-6 text-muted-foreground"
              lines={4}
              text={terms}
            />
          </div>
        ) : null}

        {notes ? (
          <div className="soft-panel shadow-none">
            <p className="meta-label">Notes</p>
            <TruncatedTextWithTooltip
              className="mt-3 whitespace-pre-wrap text-xs leading-normal sm:leading-6 text-muted-foreground"
              lines={4}
              text={notes}
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-medium text-foreground",
          strong && "text-base font-semibold",
        )}
      >
        {value}
      </span>
    </div>
  );
}
