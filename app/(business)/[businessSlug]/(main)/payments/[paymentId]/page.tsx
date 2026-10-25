import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  Download,
  FileText,
  ReceiptText,
} from "lucide-react";

import {
  DashboardDetailHeader,
  DashboardPage,
} from "@/components/shared/dashboard-layout";
import { DetailPageHeaderFallback, DetailSectionFallback } from "@/components/shared/detail-section-fallback";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import {
  DetailPageHeaderErrorFallback,
  DetailSectionErrorFallback,
} from "@/components/shared/region-error-fallback";
import { Button } from "@/components/ui/button";
import {
  MobileHeaderSlot,
  mobileNavbarIconButtonClassName,
} from "@/components/shell/mobile-header-slot";
import { getBusinessInvoicePath, getBusinessPaymentReceiptExportPath, getBusinessPaymentReceiptPath } from "@/features/businesses/routes";
import { voidPaymentAction } from "@/features/invoices/actions";
import { PaymentStatusBadge } from "@/features/invoices/components/payment-status-badge";
import { VoidPaymentDialog } from "@/features/invoices/components/void-payment-dialog";
import { PaymentBalanceSection, PaymentDetailsSection } from "@/features/invoices/components/payment-details-section";
import { getPaymentDetailForBusiness } from "@/features/invoices/queries";
import { formatQuoteMoney } from "@/features/invoices/utils";
import { formatQuoteDate } from "@/features/quotes/utils";
import { getAppShellContext } from "@/lib/app-shell/context";
import { hasOperationalBusinessAccess } from "@/lib/db/business-access";
import { createNoIndexMetadata } from "@/lib/seo/site";

type PaymentDetailPageProps = {
  params: Promise<{ businessSlug: string; paymentId: string }>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "Payment detail",
  description: "View a recorded payment and its receipt.",
});

export const instant = true;

/**
 * Payment detail page — mirrors the invoice detail composition.
 *
 * `DashboardDetailHeader` (eyebrow + amount + status badge + mobile-slot
 * actions) → payment details (method, links, notes) → invoice balance.
 * All dynamic reads are pushed into `<Suspense>`-wrapped child server
 * components so the shell paints instantly on client navigation.
 */
export default function PaymentDetailPage({ params }: PaymentDetailPageProps) {
  return (
    <DashboardPage className="pb-24">
      <RegionErrorBoundary fallback={<DetailPageHeaderErrorFallback />}>
        <Suspense fallback={<DetailPageHeaderFallback />}>
          <PaymentHeaderRegion params={params} />
        </Suspense>
      </RegionErrorBoundary>

      <div className="flex flex-col gap-6">
        <RegionErrorBoundary
          fallback={<DetailSectionErrorFallback title="Payment details" />}
        >
          <Suspense fallback={<DetailSectionFallback rows={4} />}>
            <PaymentDetailsRegion params={params} />
          </Suspense>
        </RegionErrorBoundary>

        <RegionErrorBoundary
          fallback={<DetailSectionErrorFallback title="Invoice balance" />}
        >
          <Suspense fallback={<DetailSectionFallback rows={2} />}>
            <PaymentBalanceRegion params={params} />
          </Suspense>
        </RegionErrorBoundary>
      </div>
    </DashboardPage>
  );
}

/* -------------------------------------------------------------------------- */
/*  Regions — each resolves params + the slice it renders                     */
/* -------------------------------------------------------------------------- */

async function PaymentHeaderRegion({ params }: PaymentDetailPageProps) {
  const { businessSlug, paymentId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const payment = await getPaymentDetailForBusiness({ businessId: businessContext.business.id, paymentId });
  if (!payment) notFound();
  const canManageFinancials = hasOperationalBusinessAccess(businessContext.role);
  const isVoided = Boolean(payment.voidedAt);

  return (
    <DashboardDetailHeader
      className="[&_.dashboard-actions]:max-lg:hidden"
      eyebrow={`Payment ${payment.paymentNumber}`}
      title={formatQuoteMoney(payment.amountInCents, payment.currency)}
      description={`${payment.customerName} · ${payment.invoiceNumber} · Paid ${formatQuoteDate(payment.paymentDate)}`}
      meta={<PaymentStatusBadge status={isVoided ? "voided" : "recorded"} />}
      actions={
        <MobileHeaderSlot desktopClassName="grid w-full gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto">
          <Button
            asChild
            aria-label="View receipt"
            title="View receipt"
            size="sm"
            className={mobileNavbarIconButtonClassName}
          >
            <Link href={getBusinessPaymentReceiptPath(businessSlug, payment.id)}>
              <ReceiptText data-icon="inline-start" />
              <span className="hidden lg:inline">View receipt</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            aria-label="View invoice"
            title="View invoice"
            size="sm"
            className={mobileNavbarIconButtonClassName}
          >
            <Link href={getBusinessInvoicePath(businessSlug, payment.invoiceId)}>
              <FileText data-icon="inline-start" />
              <span className="hidden lg:inline">View invoice</span>
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            aria-label="Download receipt"
            title="Download receipt"
            size="sm"
            className={mobileNavbarIconButtonClassName}
          >
            <a href={getBusinessPaymentReceiptExportPath(businessSlug, payment.id)}>
              <Download data-icon="inline-start" />
              <span className="hidden lg:inline">Download receipt</span>
            </a>
          </Button>
          {canManageFinancials && !isVoided ? (
            <VoidPaymentDialog
              paymentNumber={payment.paymentNumber}
              action={voidPaymentAction.bind(null, payment.id, payment.invoiceId)}
            />
          ) : null}
        </MobileHeaderSlot>
      }
    />
  );
}

async function PaymentDetailsRegion({ params }: PaymentDetailPageProps) {
  const { businessSlug, paymentId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const payment = await getPaymentDetailForBusiness({ businessId: businessContext.business.id, paymentId });
  if (!payment) notFound();

  return <PaymentDetailsSection businessSlug={businessSlug} payment={payment} />;
}

async function PaymentBalanceRegion({ params }: PaymentDetailPageProps) {
  const { businessSlug, paymentId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const payment = await getPaymentDetailForBusiness({ businessId: businessContext.business.id, paymentId });
  if (!payment) notFound();

  return <PaymentBalanceSection businessSlug={businessSlug} payment={payment} />;
}
