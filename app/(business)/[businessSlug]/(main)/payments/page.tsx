import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  PaymentListContentFallback,
  PaymentListContentSection,
  PaymentListControlsFallback,
  PaymentListControlsSection,
} from "@/features/invoices/components/payment-list-page-sections";
import {
  getPaymentListCountForBusiness,
  getPaymentListPageForBusiness,
} from "@/features/invoices/queries";
import { paymentListFiltersSchema } from "@/features/invoices/schemas";
import {
  getBusinessPaymentsPath,
} from "@/features/businesses/routes";
import { getAppShellContext } from "@/lib/app-shell/context";
import { getCachedPageWindow } from "@/lib/pagination";
import { createNoIndexMetadata } from "@/lib/seo/site";

type PaymentsPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ITEMS_PER_PAGE = 10;

export const metadata: Metadata = createNoIndexMetadata({
  title: "Payments",
  description: "List, filter, and manage payments for this business.",
});

export const instant = true;

/**
 * Payments list page — non-blocking structural shell.
 *
 * Returns the DashboardPage shell and skeleton fallbacks synchronously.
 * All dynamic reads (params, searchParams, getAppShellContext, queries)
 * are resolved inside Suspense-wrapped child server components.
 */
export default function PaymentsPage({
  params,
  searchParams,
}: PaymentsPageProps) {
  return (
    <DashboardPage>
      <PageHeader title="Payments" />

      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<PaymentListControlsFallback />}>
          <PaymentsControlsRegion params={params} searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<PaymentListContentFallback />}>
          <PaymentsListRegion params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Controls region — resolves context and passes data to controls section
// ---------------------------------------------------------------------------

async function PaymentsControlsRegion({
  params,
  searchParams,
}: PaymentsPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const parsedFilters = paymentListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        status: "all" as const,
        method: "all" as const,
        from: undefined,
        to: undefined,
        page: 1,
      };
  const baseFilters = {
    q: filters.q,
    status: filters.status,
    method: filters.method,
    from: filters.from,
    to: filters.to,
  };

  const paymentCountPromise = getPaymentListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });

  return (
    <PaymentListControlsSection
      businessSlug={businessSlug}
      filters={filters}
      searchParams={resolvedSearchParams}
      totalItemsPromise={paymentCountPromise}
    />
  );
}

// ---------------------------------------------------------------------------
// List region — resolves context and passes page data to content section
// ---------------------------------------------------------------------------

async function PaymentsListRegion({
  params,
  searchParams,
}: PaymentsPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const parsedFilters = paymentListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        status: "all" as const,
        method: "all" as const,
        from: undefined,
        to: undefined,
        page: 1,
      };
  const baseFilters = {
    q: filters.q,
    status: filters.status,
    method: filters.method,
    from: filters.from,
    to: filters.to,
  };

  const paymentCountPromise = getPaymentListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });
  const paymentPageDataPromise = paymentCountPromise.then(async (totalItems) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, filters.page), totalPages);
    const cachedPageNumbers = totalItems
      ? getCachedPageWindow(currentPage, totalPages)
      : [];
    const cachedPageEntries = await Promise.all(
      cachedPageNumbers.map(async (page) => [
        page,
        await getPaymentListPageForBusiness({
          businessId: businessContext.business.id,
          filters: baseFilters,
          page,
          pageSize: ITEMS_PER_PAGE,
        }),
      ] as const),
    );
    const cachedPages = Object.fromEntries(cachedPageEntries);

    return {
      cachedPages,
      currentPage,
      filterKey: JSON.stringify(baseFilters),
      totalItems,
      totalPages,
    };
  });

  const hasNonViewFilters = Boolean(
    baseFilters.q || baseFilters.status !== "all" || baseFilters.method !== "all" || baseFilters.from || baseFilters.to,
  );
  const clearFiltersPath = getBusinessPaymentsPath(businessSlug);

  return (
    <PaymentListContentSection
      businessSlug={businessSlug}
      clearFiltersPath={clearFiltersPath}
      filters={filters}
      hasNonViewFilters={hasNonViewFilters}
      pageDataPromise={paymentPageDataPromise}
      searchParams={resolvedSearchParams}
      totalItemsPromise={paymentCountPromise}
    />
  );
}
