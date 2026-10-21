import Link from "next/link";
import { Mail, ReceiptText } from "lucide-react";

import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardEmptyState,
  DashboardSection,
  DashboardTableContainer,
} from "@/components/shared/dashboard-layout";
import { InfoTile } from "@/components/shared/info-tile";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBusinessQuotePath } from "@/features/businesses/routes";
import type {
  InvoiceDetailCore,
  InvoiceLineItemView,
} from "@/features/invoices/types";
import { formatQuoteMoney } from "@/features/invoices/utils";
import { formatQuoteDateTime } from "@/features/quotes/utils";

function money(cents: number, currency: string) {
  return formatQuoteMoney(cents, currency);
}

export function InvoiceLineItemsSection({
  currency,
  items,
  subtotalInCents,
  discountInCents,
  taxInCents,
  taxLabel,
  totalInCents,
}: {
  currency: string;
  items: InvoiceLineItemView[];
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  taxLabel: string | null;
  totalInCents: number;
}) {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="What the customer is being billed for."
      title={`Line items (${items.length})`}
    >
      <DashboardTableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(item.unitPriceInCents, currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(item.lineTotalInCents, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DashboardTableContainer>
      <div className="soft-panel flex w-full flex-col gap-3 shadow-none">
        <p className="meta-label">Summary</p>
        <InvoiceSummaryRow label="Subtotal" value={money(subtotalInCents, currency)} />
        {discountInCents > 0 ? (
          <InvoiceSummaryRow label="Discount" value={`-${money(discountInCents, currency)}`} />
        ) : null}
        {taxInCents > 0 ? (
          <InvoiceSummaryRow
            label={taxLabel ? `Tax (${taxLabel})` : "Tax"}
            value={money(taxInCents, currency)}
          />
        ) : null}
        <div className="border-t pt-3">
          <InvoiceSummaryRow label="Total" value={money(totalInCents, currency)} strong />
        </div>
      </div>
    </DashboardSection>
  );
}

export function InvoiceSummaryRow({
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
        className={
          strong
            ? "text-base font-semibold text-foreground tabular-nums"
            : "text-sm font-medium text-foreground tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

export function InvoiceDetailsSection({
  businessSlug,
  invoice,
}: {
  businessSlug: string;
  invoice: InvoiceDetailCore;
}) {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Source quote, notes, and payment terms."
      title="Details"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoTile
          icon={ReceiptText}
          label="Linked quote"
          value={
            invoice.quoteId ? (
              <Link
                className="hover:underline"
                href={getBusinessQuotePath(businessSlug, invoice.quoteId)}
              >
                View quote
              </Link>
            ) : (
              "Created manually"
            )
          }
        />
        <InfoTile
          icon={Mail}
          label="Customer email"
          valueClassName="break-all"
          value={
            invoice.customerEmail ? (
              <a
                className="underline-offset-4 hover:underline"
                href={`mailto:${invoice.customerEmail}`}
              >
                {invoice.customerEmail}
              </a>
            ) : (
              "Not provided"
            )
          }
        />
      </div>
      {invoice.notes ? (
        <div className="soft-panel shadow-none">
          <p className="meta-label">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
            {invoice.notes}
          </p>
        </div>
      ) : null}
      {invoice.paymentTerms ? (
        <div className="soft-panel shadow-none">
          <p className="meta-label">Payment terms</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
            {invoice.paymentTerms}
          </p>
        </div>
      ) : null}
    </DashboardSection>
  );
}

export function InvoiceActivitySection({
  activity,
}: {
  activity: Array<{ id: string; type: string; summary: string; createdAt: Date }>;
}) {
  const paymentEvents = activity.filter((item) =>
    ["invoice.payment_recorded", "payment.voided", "invoice.payment_voided", "invoice.paid", "invoice.sent", "invoice.created", "invoice.voided", "invoice.overdue"].includes(item.type),
  );
  const latestActivity = paymentEvents[0];

  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Submission, payment, and owner actions."
      title="Activity log"
    >
      {latestActivity ? (
        <>
          <DashboardDetailFeed>
            <DashboardDetailFeedItem
              meta={formatQuoteDateTime(latestActivity.createdAt)}
              title={latestActivity.summary}
            />
          </DashboardDetailFeed>
          {paymentEvents.length > 1 ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button className="w-full" type="button" variant="outline">
                  View all activity
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-xl">
                <SheetHeader>
                  <SheetTitle>Invoice activity</SheetTitle>
                  <SheetDescription>
                    Full timeline of events and owner actions for this invoice.
                  </SheetDescription>
                </SheetHeader>
                <SheetBody className="min-h-0 flex-1">
                  <ScrollArea className="h-full pr-4">
                    <DashboardDetailFeed>
                      {paymentEvents.map((item) => (
                        <DashboardDetailFeedItem
                          key={item.id}
                          meta={formatQuoteDateTime(item.createdAt)}
                          title={item.summary}
                        />
                      ))}
                    </DashboardDetailFeed>
                  </ScrollArea>
                </SheetBody>
              </SheetContent>
            </Sheet>
          ) : null}
        </>
      ) : (
        <DashboardEmptyState
          description="Send the invoice or record a payment to start the timeline for this invoice."
          title="No invoice activity yet"
          variant="section"
        />
      )}
    </DashboardSection>
  );
}
