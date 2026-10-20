import { BusinessAvatar } from "@/components/shared/business-avatar";
import { formatQuoteDate, formatQuoteDateTime, formatQuoteMoney } from "@/features/quotes/utils";
import type { DashboardQuoteDetail } from "@/features/quotes/types";

type QuotePrintDocumentProps = {
  businessName: string;
  businessLogoStoragePath?: string | null;
  businessSlug?: string;
  quote: DashboardQuoteDetail;
  acceptance?: {
    signerName: string;
    acceptedAt: Date | string;
    quoteVersion: number;
  } | null;
};

export function QuotePrintDocument({
  businessName,
  businessLogoStoragePath,
  businessSlug,
  quote,
  acceptance,
}: QuotePrintDocumentProps) {
  const logoUrl =
    businessLogoStoragePath && businessSlug
      ? `/api/business/${businessSlug}/logo`
      : null;

  return (
    <article
      data-padding="none"
      className="section-panel mx-auto flex w-full max-w-[58rem] flex-col gap-6 px-6 py-6 sm:px-8 sm:py-8 print:max-w-none print:gap-4 print:rounded-none print:border-0 print:bg-transparent print:px-0 print:py-0 print:shadow-none"
      data-export-document
    >
      <header className="flex flex-col gap-6 border-b border-border/70 pb-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <p className="meta-label">Quote</p>
            <div className="flex flex-col gap-2">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance">
                {quote.title}
              </h2>
              <div className="flex items-center gap-2.5">
                <BusinessAvatar name={businessName} logoUrl={logoUrl} size="sm" />
                <p className="text-sm leading-6 text-muted-foreground">
                  Prepared by {businessName}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:min-w-72 sm:grid-cols-2 md:grid-cols-1">
            <DetailCard label="Quote number" value={quote.quoteNumber} />
            <DetailCard
              label="Valid until"
              value={formatQuoteDate(quote.validUntil)}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div data-padding="none" className="soft-panel px-4 py-4 shadow-none print:border-border/70">
            <p className="meta-label">Prepared for</p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
              {quote.customerName}
            </p>
            <p className="mt-1 break-all text-sm leading-6 text-muted-foreground">
              {quote.customerEmail ??
                (quote.customerContactMethod === "email"
                  ? quote.customerContactHandle
                  : "No email saved")}
            </p>
          </div>

          <div data-padding="none" className="soft-panel px-4 py-4 shadow-none print:border-border/70">
            <p className="meta-label">Overview</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <DetailRow
                label="Line items"
                value={`${quote.items.length} ${quote.items.length === 1 ? "item" : "items"}`}
              />
              <DetailRow
                label="Quote total"
                value={formatQuoteMoney(quote.totalInCents, quote.currency)}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-xl border border-border/75 bg-background/95 print:border-border/70 print:bg-transparent">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/28 text-left">
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
                {quote.items.length ? (
                  quote.items.map((item) => (
                    <tr className="border-t border-border/75" key={item.id}>
                      <td className="px-4 py-3 align-top text-foreground">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-foreground">
                            {item.description || "Untitled item"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">
                        {item.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {formatQuoteMoney(item.unitPriceInCents, quote.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatQuoteMoney(item.lineTotalInCents, quote.currency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-muted-foreground"
                      colSpan={4}
                    >
                      No line items added yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section data-padding="none" className="soft-panel px-4 py-4 shadow-none print:border-border/70">
            <p className="meta-label">Totals</p>
            <div className="mt-4 flex flex-col gap-3">
              <SummaryRow
                label="Subtotal"
                value={formatQuoteMoney(quote.subtotalInCents, quote.currency)}
              />
              <SummaryRow
                label="Discount"
                value={`-${formatQuoteMoney(quote.discountInCents, quote.currency)}`}
              />
              {quote.taxInCents > 0 ? (
                <SummaryRow
                  label={quote.taxLabel ? `Tax (${quote.taxLabel})` : "Tax"}
                  value={formatQuoteMoney(quote.taxInCents, quote.currency)}
                />
              ) : null}
              <div className="border-t border-border/70 pt-3">
                <SummaryRow
                  label="Total"
                  strong
                  value={formatQuoteMoney(quote.totalInCents, quote.currency)}
                />
              </div>
            </div>
          </section>

          <section data-padding="none" className="soft-panel px-4 py-4 shadow-none print:border-border/70">
            <p className="meta-label">Quote details</p>
            <div className="mt-4 flex flex-col gap-3">
              <DetailRow label="Business" value={businessName} />
              <DetailRow label="Customer" value={quote.customerName} />
              <DetailRow
                label="Valid until"
                value={formatQuoteDate(quote.validUntil)}
              />
              <DetailRow label="Status" value={quote.status} />
              {quote.status === "accepted" && acceptance ? (
                <>
                  <DetailRow label="Accepted by" value={acceptance.signerName} />
                  <DetailRow
                    label="Accepted on"
                    value={formatQuoteDateTime(new Date(acceptance.acceptedAt))}
                  />
                  <DetailRow label="Accepted version" value={`v${acceptance.quoteVersion}`} />
                </>
              ) : null}
            </div>
          </section>
        </aside>
      </div>
    </article>
  );
}

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div data-padding="none" className="soft-panel px-4 py-4 shadow-none print:border-border/70">
      <p className="meta-label">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
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
        className={strong ? "text-base font-semibold text-foreground" : "text-sm font-medium text-foreground"}
      >
        {value}
      </span>
    </div>
  );
}
