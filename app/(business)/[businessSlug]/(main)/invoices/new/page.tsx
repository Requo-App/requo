import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import { getBusinessInvoicesPath } from "@/features/businesses/routes";
import { createInvoiceAction } from "@/features/invoices/actions";
import { NewInvoiceForm } from "@/features/invoices/components/new-invoice-form";
import { getQuoteDetailForBusiness } from "@/features/quotes/queries";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createNoIndexMetadata } from "@/lib/seo/site";

type NewInvoicePageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "New invoice",
  description: "Create a manual invoice or convert an accepted quote.",
});

export const instant = true;

/**
 * New invoice page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, searchParams, getAppShellContext, quote
 * prefill) are pushed into a `<Suspense>`-wrapped child server component so
 * the shell paints instantly on client navigation.
 */
export default function NewInvoicePage({ params, searchParams }: NewInvoicePageProps) {
  return (
    <DashboardPage>
      <RegionErrorBoundary fallback={<NewInvoiceSkeleton />}>
        <Suspense fallback={<NewInvoiceSkeleton />}>
          <NewInvoiceContent params={params} searchParams={searchParams} />
        </Suspense>
      </RegionErrorBoundary>
    </DashboardPage>
  );
}

export function NewInvoiceSkeleton() {
  return (
    <>
      <PageHeader eyebrow="New invoice" title="Create a new invoice" />
      <div className="dashboard-detail-layout items-start xl:grid-cols-[minmax(0,1.08fr)_0.92fr]">
        <div className="dashboard-side-stack min-w-0">
          <div className="section-panel animate-pulse">
            <div className="flex flex-col gap-5">
              <div className="h-6 w-32 rounded-md bg-muted" />
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-3">
                  <div className="h-4 w-24 rounded-md bg-muted" />
                  <div className="h-12 w-full rounded-xl bg-muted" />
                </div>
                <div className="grid gap-3">
                  <div className="h-4 w-24 rounded-md bg-muted" />
                  <div className="h-12 w-full rounded-xl bg-muted" />
                </div>
              </div>
              <div className="grid gap-3">
                <div className="h-4 w-24 rounded-md bg-muted" />
                <div className="h-12 w-full rounded-xl bg-muted" />
              </div>
            </div>
          </div>
          <div className="section-panel animate-pulse">
            <div className="h-6 w-28 rounded-md bg-muted" />
            <div className="mt-5 h-24 w-full rounded-xl bg-muted" />
          </div>
        </div>
        <div className="section-panel hidden animate-pulse xl:block">
          <div className="h-8 w-40 rounded-md bg-muted" />
          <div className="mt-5 h-64 w-full rounded-xl bg-muted" />
        </div>
      </div>
    </>
  );
}

async function NewInvoiceContent({ params, searchParams }: NewInvoicePageProps) {
  const [{ businessSlug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const rawQuoteId = Array.isArray(rawSearchParams.quoteId) ? rawSearchParams.quoteId[0] : rawSearchParams.quoteId;
  const quoteId = typeof rawQuoteId === "string" && rawQuoteId.trim() ? rawQuoteId.trim() : null;
  const quote = quoteId
    ? await getQuoteDetailForBusiness({ businessId: businessContext.business.id, quoteId })
    : null;

  if (quoteId && (!quote || quote.status !== "accepted")) {
    redirect(getBusinessInvoicesPath(businessSlug));
  }

  const action = createInvoiceAction.bind(null, quoteId);

  return (
    <>
      <PageHeader
        eyebrow="New invoice"
        title={quote ? `Turn ${quote.quoteNumber} into an invoice` : "Create a new invoice"}
      />
      <NewInvoiceForm
        action={action}
        businessSlug={businessSlug}
        businessName={businessContext.business.name}
        businessLogoStoragePath={businessContext.business.logoStoragePath}
        currency={businessContext.business.defaultCurrency}
        quote={
          quote
            ? {
                quoteNumber: quote.quoteNumber,
                title: quote.title,
                customerName: quote.customerName,
                customerEmail: quote.customerEmail,
                customerContactMethod: quote.customerContactMethod,
                customerContactHandle: quote.customerContactHandle,
                items: quote.items.map((item) => ({
                  description: item.description,
                  quantity: item.quantity,
                  unitPriceInCents: item.unitPriceInCents,
                })),
                discountInCents: quote.discountInCents,
                taxInCents: quote.taxInCents,
                taxLabel: quote.taxLabel,
              }
            : null
        }
      />
    </>
  );
}
