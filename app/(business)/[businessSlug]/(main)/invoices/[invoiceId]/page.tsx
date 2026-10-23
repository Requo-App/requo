import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pencil, Printer, ReceiptText } from "lucide-react";

import {
  DashboardDetailHeader,
  DashboardPage,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import {
  DetailPageHeaderFallback,
  DetailSectionFallback,
} from "@/components/shared/detail-section-fallback";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import { Button } from "@/components/ui/button";
import {
  MobileHeaderSlot,
  mobileNavbarIconButtonClassName,
} from "@/components/shell/mobile-header-slot";
import {
  getBusinessInvoiceEditPath,
  getBusinessInvoiceExportPath,
  getBusinessInvoicePrintPath,
} from "@/features/businesses/routes";
import { formatQuoteDate } from "@/features/quotes/utils";
import {
  recordPaymentAction,
  sendInvoiceAction,
  voidInvoiceAction,
} from "@/features/invoices/actions";
import { InvoiceManageDropdown } from "@/features/invoices/components/invoice-manage-dropdown";
import {
  InvoiceActivitySection,
  InvoiceDetailsSection,
  InvoiceLineItemsSection,
} from "@/features/invoices/components/invoice-detail-sections";
import { InvoicePaymentPanel } from "@/features/invoices/components/invoice-payment-panel";
import { InvoiceStatusBadge } from "@/features/invoices/components/invoice-status-badge";
import { RecordPaymentDialog } from "@/features/invoices/components/record-payment-dialog";
import { SendInvoiceDialog } from "@/features/invoices/components/send-invoice-dialog";
import { isEmailConfigured } from "@/lib/env";
import {
  getInvoiceActivityForBusiness,
  getInvoiceDetailCoreForBusiness,
  getInvoiceItemsForBusiness,
  getInvoicePaymentsForBusiness,
} from "@/features/invoices/queries";
import { getAppShellContext } from "@/lib/app-shell/context";
import { hasOperationalBusinessAccess } from "@/lib/db/business-access";
import { createNoIndexMetadata } from "@/lib/seo/site";

type InvoiceDetailPageProps = {
  params: Promise<{ businessSlug: string; invoiceId: string }>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "Invoice detail",
  description: "View an invoice, record payments, and track the balance.",
});

export const instant = true;

/**
 * Invoice detail page — returns the structural shell synchronously.
 *
 * Single-column flow: line items (full width) → payments → details
 * (source quote, notes, terms) → activity. Money has a single home per
 * concern: the line-items summary owns Subtotal/Discount/Tax/Total, the
 * payments section owns Total/Paid/Balance.
 *
 * All dynamic reads (params, getAppShellContext, invoice queries) are pushed
 * into `<Suspense>`-wrapped child server components so the shell paints
 * instantly on client navigation.
 */
export default function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  return (
    <DashboardPage className="pb-24">
      <RegionErrorBoundary fallback={<DetailPageHeaderFallback />}>
        <Suspense fallback={<DetailPageHeaderFallback />}>
          <InvoiceHeaderRegion params={params} />
        </Suspense>
      </RegionErrorBoundary>

      <div className="flex flex-col gap-6">
        <RegionErrorBoundary fallback={<DetailSectionFallback rows={4} />}>
          <Suspense fallback={<DetailSectionFallback rows={4} />}>
            <InvoiceItemsRegion params={params} />
          </Suspense>
        </RegionErrorBoundary>

        <RegionErrorBoundary fallback={<DetailSectionFallback rows={3} />}>
          <Suspense fallback={<DetailSectionFallback rows={3} />}>
            <InvoicePaymentsRegion params={params} />
          </Suspense>
        </RegionErrorBoundary>

        <RegionErrorBoundary fallback={<DetailSectionFallback rows={2} />}>
          <Suspense fallback={<DetailSectionFallback rows={2} />}>
            <InvoiceDetailsRegion params={params} />
          </Suspense>
        </RegionErrorBoundary>

        <RegionErrorBoundary fallback={<DetailSectionFallback rows={2} />}>
          <Suspense fallback={<DetailSectionFallback rows={2} />}>
            <InvoiceActivityRegion params={params} />
          </Suspense>
        </RegionErrorBoundary>
      </div>
    </DashboardPage>
  );
}

/* -------------------------------------------------------------------------- */
/*  Regions — each resolves params + the slice it renders                     */
/* -------------------------------------------------------------------------- */

async function InvoiceHeaderRegion({ params }: InvoiceDetailPageProps) {
  const { businessSlug, invoiceId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const invoice = await getInvoiceDetailCoreForBusiness({
    businessId: businessContext.business.id,
    invoiceId,
  });

  if (!invoice) {
    notFound();
  }

  const canManageFinancials = hasOperationalBusinessAccess(businessContext.role);
  const isVoided = invoice.status === "voided";
  const isDraft = invoice.status === "draft";
  const canEditDraft = canManageFinancials && isDraft;
  const canMarkSent = canManageFinancials && isDraft;
  const canVoidInvoice = canManageFinancials && !isVoided && invoice.paidInCents === 0;
  const canRecordPayment =
    canManageFinancials && !isDraft && !isVoided && invoice.balanceInCents > 0;
  const printHref = getBusinessInvoicePrintPath(businessSlug, invoice.id);
  const editHref = canEditDraft
    ? getBusinessInvoiceEditPath(businessSlug, invoice.id)
    : null;
  // One primary per state: Record payment > Send > Print. Edit draft and
  // Print serve as the secondary; everything else lives in More actions.
  const showPrimaryPrint = !canRecordPayment && !canMarkSent;
  const showSecondaryEdit = canMarkSent && editHref !== null;
  const showSecondaryPrint = canRecordPayment;

  return (
    <DashboardDetailHeader
      className="[&_.dashboard-actions]:max-lg:hidden"
      eyebrow={`Invoice ${invoice.invoiceNumber}`}
      title={invoice.title}
      description={`${invoice.customerName} · Issued ${formatQuoteDate(invoice.issueDate)} · Due ${formatQuoteDate(invoice.dueDate)}`}
      meta={<InvoiceStatusBadge status={invoice.status} />}
      actions={
          <MobileHeaderSlot desktopClassName="grid w-full gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto">
          {canRecordPayment ? (
            <RecordPaymentDialog
              action={recordPaymentAction.bind(null, invoice.id)}
              balanceInCents={invoice.balanceInCents}
              currency={invoice.currency}
              invoiceNumber={invoice.invoiceNumber}
              customerName={invoice.customerName}
              compactOnMobile
            />
          ) : null}
          {canMarkSent ? (
            <SendInvoiceDialog
              action={sendInvoiceAction.bind(null, invoice.id)}
              invoiceNumber={invoice.invoiceNumber}
              customerName={invoice.customerName}
              customerEmail={invoice.customerEmail}
              totalInCents={invoice.totalInCents}
              currency={invoice.currency}
              dueDate={invoice.dueDate}
              isRequoEmailAvailable={isEmailConfigured}
            />
          ) : null}
          {showPrimaryPrint ? (
            <Button
              asChild
              aria-label="Print invoice"
              title="Print invoice"
              size="sm"
              className={mobileNavbarIconButtonClassName}
            >
              <Link href={printHref}>
                <Printer data-icon="inline-start" />
                <span className="hidden lg:inline">Print</span>
              </Link>
            </Button>
          ) : null}
          {showSecondaryEdit && editHref ? (
            <Button
              asChild
              variant="outline"
              aria-label="Edit draft"
              title="Edit draft"
              size="sm"
              className={mobileNavbarIconButtonClassName}
            >
              <Link href={editHref}>
                <Pencil data-icon="inline-start" />
                <span className="hidden lg:inline">Edit draft</span>
              </Link>
            </Button>
          ) : null}
          {showSecondaryPrint ? (
            <Button
              asChild
              variant="outline"
              aria-label="Print invoice"
              title="Print invoice"
              size="sm"
              className={mobileNavbarIconButtonClassName}
            >
              <Link href={printHref}>
                <Printer data-icon="inline-start" />
                <span className="hidden lg:inline">Print</span>
              </Link>
            </Button>
          ) : null}
          <InvoiceManageDropdown
            editHref={showSecondaryEdit ? null : editHref}
            printHref={showPrimaryPrint || showSecondaryPrint ? null : printHref}
            canVoid={canVoidInvoice}
            voidAction={voidInvoiceAction.bind(null, invoice.id)}
            pdfHref={getBusinessInvoiceExportPath(businessSlug, invoice.id, "pdf")}
            pngHref={getBusinessInvoiceExportPath(businessSlug, invoice.id, "png")}
          />
        </MobileHeaderSlot>
      }
    />
  );
}

async function InvoiceItemsRegion({ params }: InvoiceDetailPageProps) {
  const { businessSlug, invoiceId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const [invoice, items] = await Promise.all([
    getInvoiceDetailCoreForBusiness({ businessId: businessContext.business.id, invoiceId }),
    getInvoiceItemsForBusiness({ businessId: businessContext.business.id, invoiceId }),
  ]);

  if (!invoice) {
    notFound();
  }

  if (!items.length) {
    return (
      <DashboardSection title="No line items">
        <div className="flex flex-col gap-2">
          <ReceiptText className="size-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">This invoice has no line items.</p>
        </div>
      </DashboardSection>
    );
  }

  return (
    <InvoiceLineItemsSection
      currency={invoice.currency}
      items={items}
      subtotalInCents={invoice.subtotalInCents}
      discountInCents={invoice.discountInCents}
      taxInCents={invoice.taxInCents}
      taxLabel={invoice.taxLabel}
      totalInCents={invoice.totalInCents}
    />
  );
}

async function InvoicePaymentsRegion({ params }: InvoiceDetailPageProps) {
  const { businessSlug, invoiceId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const [invoice, payments] = await Promise.all([
    getInvoiceDetailCoreForBusiness({ businessId: businessContext.business.id, invoiceId }),
    getInvoicePaymentsForBusiness({ businessId: businessContext.business.id, invoiceId }),
  ]);

  if (!invoice) {
    notFound();
  }

  const canManageFinancials = hasOperationalBusinessAccess(businessContext.role);
  const canRecordPayment = canManageFinancials && invoice.status !== "draft" && invoice.status !== "voided" && invoice.balanceInCents > 0;

  return (
    <InvoicePaymentPanel
      businessSlug={businessSlug}
      canManageFinancials={canManageFinancials}
      canRecordPayment={canRecordPayment}
      currency={invoice.currency}
      customerName={invoice.customerName}
      dueDate={invoice.dueDate}
      invoiceId={invoice.id}
      invoiceNumber={invoice.invoiceNumber}
      initialPayments={payments}
      lifecycleStatus={invoice.status}
      recordAction={recordPaymentAction.bind(null, invoice.id)}
      totalInCents={invoice.totalInCents}
    />
  );
}

async function InvoiceDetailsRegion({ params }: InvoiceDetailPageProps) {
  const { businessSlug, invoiceId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const invoice = await getInvoiceDetailCoreForBusiness({
    businessId: businessContext.business.id,
    invoiceId,
  });

  if (!invoice) {
    notFound();
  }

  return <InvoiceDetailsSection businessSlug={businessSlug} invoice={invoice} />;
}

async function InvoiceActivityRegion({ params }: InvoiceDetailPageProps) {
  const { businessSlug, invoiceId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const [invoice, activity] = await Promise.all([
    getInvoiceDetailCoreForBusiness({ businessId: businessContext.business.id, invoiceId }),
    getInvoiceActivityForBusiness({ businessId: businessContext.business.id, invoiceId }),
  ]);

  if (!invoice) {
    notFound();
  }

  return <InvoiceActivitySection activity={activity} />;
}
