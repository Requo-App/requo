import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Hash,
  Mail,
  ReceiptText,
  User,
  Wallet,
} from "lucide-react";

import { DashboardSection } from "@/components/shared/dashboard-layout";
import { InfoTile } from "@/components/shared/info-tile";
import { Button } from "@/components/ui/button";
import { getBusinessInvoicePath } from "@/features/businesses/routes";
import { InvoiceStatusBadge } from "@/features/invoices/components/invoice-status-badge";
import type { PaymentDetailView } from "@/features/invoices/types";
import { getVoidReasonLabel } from "@/features/invoices/void-reasons";
import { formatQuoteMoney, getPaymentMethodLabel } from "@/features/invoices/utils";
import { formatQuoteDate, formatQuoteDateTime } from "@/features/quotes/utils";

export function PaymentDetailsSection({
  businessSlug,
  payment,
}: {
  businessSlug: string;
  payment: PaymentDetailView;
}) {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="How and when this payment was recorded."
      title="Payment details"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoTile
          icon={Wallet}
          label="Method"
          value={getPaymentMethodLabel(payment.method)}
        />
        <InfoTile
          icon={CalendarDays}
          label="Payment date"
          value={formatQuoteDate(payment.paymentDate)}
        />
        <InfoTile
          icon={Hash}
          label="Reference"
          value={payment.reference ?? "—"}
        />
        <InfoTile
          icon={User}
          label="Recorded by"
          value={payment.recordedByName ?? "—"}
          description={formatQuoteDateTime(payment.createdAt)}
        />
        <InfoTile
          icon={ReceiptText}
          label="Invoice"
          value={
            <Link
              className="hover:underline"
              href={getBusinessInvoicePath(businessSlug, payment.invoiceId)}
            >
              {payment.invoiceNumber}
            </Link>
          }
          description={payment.invoiceTitle}
        />
        <InfoTile
          icon={Mail}
          label="Customer"
          value={payment.customerName}
          description={payment.customerEmail ?? undefined}
        />
      </div>
      {payment.notes ? (
        <div className="soft-panel shadow-none">
          <p className="meta-label">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
            {payment.notes}
          </p>
        </div>
      ) : null}
      {payment.voidedAt ? (
        <div className="soft-panel shadow-none">
          <p className="meta-label">Void reason</p>
          <p className="mt-2 text-sm leading-6 text-foreground">
            {getVoidReasonLabel(payment.voidReason)}
          </p>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">Payment recorded in Requo. Requo did not process this payment.</p>
    </DashboardSection>
  );
}

export function PaymentBalanceSection({
  businessSlug,
  payment,
}: {
  businessSlug: string;
  payment: PaymentDetailView;
}) {
  const amount = (cents: number) => formatQuoteMoney(cents, payment.currency);

  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description={`What remains on ${payment.invoiceNumber} after this payment.`}
      title="Invoice balance"
      action={<InvoiceStatusBadge status={payment.invoiceStatus} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoTile label="Invoice total" value={<span className="tabular-nums">{amount(payment.invoiceTotalInCents)}</span>} />
        <InfoTile label="Amount paid" value={<span className="tabular-nums">{amount(payment.invoicePaidInCents)}</span>} />
        <InfoTile
          label="Balance due"
          value={<span className="font-semibold tabular-nums">{amount(payment.invoiceBalanceInCents)}</span>}
        />
      </div>
      <Button asChild variant="outline" size="sm" className="w-full sm:w-auto sm:self-start">
        <Link href={getBusinessInvoicePath(businessSlug, payment.invoiceId)}>
          <FileText data-icon="inline-start" />
          View invoice
        </Link>
      </Button>
    </DashboardSection>
  );
}
