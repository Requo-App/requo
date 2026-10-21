import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage, DashboardSection } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { DetailPageHeaderFallback, DetailSectionFallback } from "@/components/shared/detail-section-fallback";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import { InfoTile } from "@/components/shared/info-tile";
import { Button } from "@/components/ui/button";
import { getBusinessPaymentPath, getBusinessPaymentReceiptExportPath } from "@/features/businesses/routes";
import { getPaymentDetailForBusiness } from "@/features/invoices/queries";
import { getVoidReasonLabel } from "@/features/invoices/void-reasons";
import { formatQuoteMoney, getPaymentMethodLabel } from "@/features/invoices/utils";
import { formatQuoteDate } from "@/features/quotes/utils";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createNoIndexMetadata } from "@/lib/seo/site";

type PaymentReceiptPageProps = {
  params: Promise<{ businessSlug: string; paymentId: string }>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "Payment receipt",
  description: "View a payment receipt.",
});

export const instant = true;

export default function PaymentReceiptPage({ params }: PaymentReceiptPageProps) {
  return (
    <DashboardPage>
      <RegionErrorBoundary fallback={<ReceiptPageSkeleton />}>
        <Suspense fallback={<DetailPageHeaderFallback />}>
          <ReceiptHeaderRegion params={params} />
        </Suspense>
      </RegionErrorBoundary>
      <RegionErrorBoundary fallback={<DetailSectionFallback rows={4} />}>
        <Suspense fallback={<DetailSectionFallback rows={4} />}>
          <ReceiptDetailRegion params={params} />
        </Suspense>
      </RegionErrorBoundary>
    </DashboardPage>
  );
}

export function ReceiptPageSkeleton() {
  return (
    <>
      <DetailPageHeaderFallback />
      <DetailSectionFallback rows={4} />
    </>
  );
}

async function ReceiptHeaderRegion({ params }: PaymentReceiptPageProps) {
  const { businessSlug, paymentId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const payment = await getPaymentDetailForBusiness({ businessId: businessContext.business.id, paymentId });
  if (!payment) notFound();

  return (
    <PageHeader
      eyebrow={`Payment receipt ${payment.paymentNumber}`}
      title={formatQuoteMoney(payment.amountInCents, payment.currency)}
      description={`Payment recorded in Requo · ${payment.invoiceNumber}`}
      actions={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href={getBusinessPaymentPath(businessSlug, payment.id)}>
              View payment
            </Link>
          </Button>
          <Button asChild>
            <a href={getBusinessPaymentReceiptExportPath(businessSlug, payment.id)}>
              Download PDF
            </a>
          </Button>
        </div>
      }
    />
  );
}

async function ReceiptDetailRegion({ params }: PaymentReceiptPageProps) {
  const { businessSlug, paymentId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const payment = await getPaymentDetailForBusiness({ businessId: businessContext.business.id, paymentId });
  if (!payment) notFound();
  const amount = (cents: number) => formatQuoteMoney(cents, payment.currency);

  return (
    <div className="flex flex-col gap-6">
      <DashboardSection title="Receipt">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile label="Payment" value={payment.paymentNumber} />
          <InfoTile label="Status" value={payment.voidedAt ? "Voided" : "Recorded"} />
          <InfoTile label="Amount" value={<span className="tabular-nums">{amount(payment.amountInCents)}</span>} />
          <InfoTile label="Currency" value={payment.currency} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile label="Payment method" value={getPaymentMethodLabel(payment.method)} />
          <InfoTile label="Payment date" value={formatQuoteDate(payment.paymentDate)} />
          <InfoTile label="Reference" value={payment.reference ?? "—"} />
          <InfoTile label="Recorded by" value={payment.recordedByName ?? "—"} />
        </div>
        {payment.voidedAt ? (
          <p className="text-sm text-muted-foreground">Void reason: {getVoidReasonLabel(payment.voidReason)}</p>
        ) : null}
      </DashboardSection>
      <DashboardSection title="Invoice">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile label="Invoice" value={payment.invoiceNumber} description={payment.invoiceTitle} />
          <InfoTile label="Customer" value={payment.customerName} />
          <InfoTile label="Invoice total" value={<span className="tabular-nums">{amount(payment.invoiceTotalInCents)}</span>} />
          <InfoTile label="Amount paid" value={<span className="tabular-nums">{amount(payment.invoicePaidInCents)}</span>} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoTile
            label="Balance due"
            value={<span className="font-semibold tabular-nums">{amount(payment.invoiceBalanceInCents)}</span>}
          />
        </div>
        {payment.notes ? <p className="whitespace-pre-wrap text-sm leading-6">{payment.notes}</p> : null}
      </DashboardSection>
    </div>
  );
}
