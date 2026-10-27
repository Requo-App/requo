import { BusinessAvatar } from "@/components/shared/business-avatar";
import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import { formatQuoteDate, formatQuoteMoney } from "@/features/quotes/utils";
import { cn } from "@/lib/utils";

export type InvoicePreviewItem = {
  id: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
};

type InvoicePreviewProps = {
  businessName: string;
  invoiceNumber?: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  currency: string;
  issueDate: string;
  dueDate: string;
  items: InvoicePreviewItem[];
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  taxLabel?: string | null;
  totalInCents: number;
  notes?: string | null;
  paymentTerms?: string | null;
  businessLogoStoragePath?: string | null;
  businessSlug?: string;
  className?: string;
};

export function InvoicePreview({
  businessName,
  invoiceNumber = "Draft — assigned after save",
  title,
  customerName,
  customerEmail,
  currency,
  issueDate,
  dueDate,
  items,
  subtotalInCents,
  discountInCents,
  taxInCents,
  taxLabel,
  totalInCents,
  notes,
  paymentTerms,
  businessLogoStoragePath,
  businessSlug,
  className,
}: InvoicePreviewProps) {
  const logoUrl =
    businessLogoStoragePath && businessSlug
      ? `/api/business/${businessSlug}/logo`
      : null;
  return (
    <article
      data-padding="none"
      className={cn("section-panel overflow-hidden p-5 sm:p-6", className)}
      aria-label="Invoice preview"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center gap-3">
                <BusinessAvatar name={businessName} logoUrl={logoUrl} />
                <span className="text-lg font-semibold tracking-tight text-foreground">
                  <TruncatedTextWithTooltip text={businessName} />
                </span>
              </div>
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                <TruncatedTextWithTooltip text={title || "Untitled invoice"} lines={2} />
              </h2>
            </div>
            <div data-padding="none" className="soft-panel w-full px-4 py-3 text-sm shadow-none sm:w-auto sm:min-w-52">
              <TruncatedTextWithTooltip
                className="text-sm font-semibold text-foreground"
                text={invoiceNumber}
              />
              <p className="mt-1 text-muted-foreground">Due {formatQuoteDate(dueDate)}</p>
              <p className="mt-1 text-muted-foreground">Issued {formatQuoteDate(issueDate)}</p>
            </div>
          </div>

          <div className="info-tile h-full min-w-0 shadow-none">
            <p className="meta-label">Billed to</p>
            <TruncatedTextWithTooltip
              className="mt-2 font-medium text-foreground"
              text={customerName || "Customer name"}
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
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <div>
                      {item.quantity} × {formatQuoteMoney(item.unitPriceInCents, currency)}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Add line items to preview the invoice breakdown.
              </div>
            )}
          </div>

          <div className="hidden @2xl/qtable:block">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/22 text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Item
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Unit price
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
                      Add line items to preview the invoice breakdown.
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
          {discountInCents > 0 ? (
            <SummaryRow
              label="Discount"
              value={`-${formatQuoteMoney(discountInCents, currency)}`}
            />
          ) : null}
          {taxInCents > 0 ? (
            <SummaryRow
              label={taxLabel ? `Tax (${taxLabel})` : "Tax"}
              value={formatQuoteMoney(taxInCents, currency)}
            />
          ) : null}
          <div className="border-t pt-3">
            <SummaryRow
              label="Total"
              value={formatQuoteMoney(totalInCents, currency)}
              strong
            />
          </div>
        </div>

        {notes ? (
          <div className="soft-panel shadow-none">
            <p className="meta-label">Notes</p>
            <TruncatedTextWithTooltip
              className="mt-3 whitespace-pre-wrap text-xs leading-normal text-muted-foreground sm:leading-6"
              lines={4}
              text={notes}
            />
          </div>
        ) : null}

        {paymentTerms ? (
          <div className="soft-panel shadow-none">
            <p className="meta-label">Payment terms</p>
            <TruncatedTextWithTooltip
              className="mt-3 whitespace-pre-wrap text-xs leading-normal text-muted-foreground sm:leading-6"
              lines={4}
              text={paymentTerms}
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
