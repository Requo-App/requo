import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  InvoiceListContentFallback,
  InvoiceListContentSection,
  InvoiceListControlsFallback,
  InvoiceListControlsSection,
  InvoiceListHeaderActions,
  InvoiceListHeaderActionsFallback,
} from "@/features/invoices/components/invoice-list-page-sections";
import {
  getInvoiceListCountForBusiness,
  getInvoiceListPageForBusiness,
} from "@/features/invoices/queries";
import { invoiceListFiltersSchema } from "@/features/invoices/schemas";
import {
  getBusinessInvoicesPath,
} from "@/features/businesses/routes";
import { getAppShellContext } from "@/lib/app-shell/context";
import { getCachedPageWindow } from "@/lib/pagination";
import { hasFeatureAccess } from "@/lib/plans";
import { createNoIndexMetadata } from "@/lib/seo/site";

type InvoicesPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ITEMS_PER_PAGE = 10;

export const metadata: Metadata = createNoIndexMetadata({
  title: "Invoices",
  description: "List, filter, and manage invoices for this business.",
});

export const instant = true;

/**
 * Invoices list page — non-blocking structural shell.
 *
 * Returns the DashboardPage shell and skeleton fallbacks synchronously.
 * All dynamic reads (params, searchParams, getAppShellContext, queries)
 * are resolved inside Suspense-wrapped child server components.
 */
export default function InvoicesPage({
  params,
  searchParams,
}: InvoicesPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Invoices"
        className="[&_.dashboard-actions]:max-lg:hidden"
        actions={
          <Suspense fallback={<InvoiceListHeaderActionsFallback />}>
            <InvoicesHeaderActionsRegion params={params} searchParams={searchParams} />
          </Suspense>
        }
      />

      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<InvoiceListControlsFallback />}>
          <InvoicesControlsRegion params={params} searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<InvoiceListContentFallback />}>
          <InvoicesListRegion params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Header actions region — page-level actions hoisted into PageHeader
// ---------------------------------------------------------------------------

async function InvoicesHeaderActionsRegion({
  params,
  searchParams,
}: InvoicesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const parsedFilters = invoiceListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        status: "all" as const,
        sort: "newest" as const,
        page: 1,
      };
  const baseFilters = {
    q: filters.q,
    status: filters.status,
    sort: filters.sort,
  };

  const canExport = hasFeatureAccess(
    businessContext.business.plan,
    "exports",
  );

  const invoiceCountPromise = getInvoiceListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });

  return (
    <InvoiceListHeaderActions
      businessSlug={businessSlug}
      canExport={canExport}
      filters={filters}
      searchParams={resolvedSearchParams}
      totalItemsPromise={invoiceCountPromise}
    />
  );
}

// ---------------------------------------------------------------------------
// Controls region — resolves context and passes data to controls section
// ---------------------------------------------------------------------------

async function InvoicesControlsRegion({
  params,
  searchParams,
}: InvoicesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const parsedFilters = invoiceListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        status: "all" as const,
        sort: "newest" as const,
        page: 1,
      };
  const baseFilters = {
    q: filters.q,
    status: filters.status,
    sort: filters.sort,
  };

  const canExport = hasFeatureAccess(
    businessContext.business.plan,
    "exports",
  );

  const invoiceCountPromise = getInvoiceListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });

  return (
    <InvoiceListControlsSection
      businessSlug={businessSlug}
      canExport={canExport}
      filters={filters}
      searchParams={resolvedSearchParams}
      totalItemsPromise={invoiceCountPromise}
    />
  );
}

// ---------------------------------------------------------------------------
// List region — resolves context and passes page data to content section
// ---------------------------------------------------------------------------

async function InvoicesListRegion({
  params,
  searchParams,
}: InvoicesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const parsedFilters = invoiceListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        status: "all" as const,
        sort: "newest" as const,
        page: 1,
      };
  const baseFilters = {
    q: filters.q,
    status: filters.status,
    sort: filters.sort,
  };

  const invoiceCountPromise = getInvoiceListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });
  const invoicePageDataPromise = invoiceCountPromise.then(async (totalItems) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, filters.page), totalPages);
    const cachedPageNumbers = totalItems
      ? getCachedPageWindow(currentPage, totalPages)
      : [];
    const cachedPageEntries = await Promise.all(
      cachedPageNumbers.map(async (page) => [
        page,
        await getInvoiceListPageForBusiness({
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
    baseFilters.q || baseFilters.status !== "all" || baseFilters.sort !== "newest",
  );
  const clearFiltersPath = getBusinessInvoicesPath(businessSlug);

  return (
    <InvoiceListContentSection
      businessSlug={businessSlug}
      clearFiltersPath={clearFiltersPath}
      filters={filters}
      hasNonViewFilters={hasNonViewFilters}
      pageDataPromise={invoicePageDataPromise}
      searchParams={resolvedSearchParams}
      totalItemsPromise={invoiceCountPromise}
    />
  );
}
