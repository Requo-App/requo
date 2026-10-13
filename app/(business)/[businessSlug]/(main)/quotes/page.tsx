import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  QuoteListContentFallback,
  QuoteListContentSection,
  QuoteListControlsFallback,
  QuoteListControlsSection,
  QuoteListHeaderActions,
  QuoteListHeaderActionsFallback,
} from "@/features/quotes/components/quote-list-page-sections";
import {
  getQuoteListCountForBusiness,
  getQuoteListPageForBusiness,
} from "@/features/quotes/queries";
import { restoreArchivedQuoteAction } from "@/features/quotes/actions";
import { quoteListFiltersSchema } from "@/features/quotes/schemas";
import {
  getBusinessQuotesPath,
} from "@/features/businesses/routes";
import { getAppShellContext } from "@/lib/app-shell/context";
import { getCachedPageWindow } from "@/lib/pagination";
import { hasFeatureAccess } from "@/lib/plans";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { FirstVisitTip } from "@/features/onboarding/components/first-visit-tip";
import { featureTips } from "@/features/onboarding/feature-tips";

type QuotesPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ITEMS_PER_PAGE = 10;

export const metadata: Metadata = createNoIndexMetadata({
  title: "Quotes",
  description: "List, filter, and manage quotes for this business.",
});

export const instant = true;

/**
 * Quotes list page — non-blocking structural shell.
 *
 * Returns the DashboardPage shell and skeleton fallbacks synchronously.
 * All dynamic reads (params, searchParams, getAppShellContext, queries)
 * are resolved inside Suspense-wrapped child server components.
 */
export default function QuotesPage({
  params,
  searchParams,
}: QuotesPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Quotes"
        className="[&_.dashboard-actions]:max-lg:hidden"
        actions={
          <Suspense fallback={<QuoteListHeaderActionsFallback />}>
            <QuotesHeaderActionsRegion params={params} searchParams={searchParams} />
          </Suspense>
        }
      />

      <FirstVisitTip {...featureTips.quotes} />

      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<QuoteListControlsFallback />}>
          <QuotesControlsRegion params={params} searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<QuoteListContentFallback />}>
          <QuotesListRegion params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Header actions region — page-level actions hoisted into PageHeader
// ---------------------------------------------------------------------------

async function QuotesHeaderActionsRegion({
  params,
  searchParams,
}: QuotesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const parsedFilters = quoteListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        view: "active" as const,
        status: "all" as const,
        sort: "newest" as const,
        page: 1,
      };
  const baseFilters = {
    q: filters.q,
    view: filters.view,
    status: filters.status,
    sort: filters.sort,
  };

  const canExport = hasFeatureAccess(
    businessContext.business.plan,
    "exports",
  );

  const quoteCountPromise = getQuoteListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });
  const archivedItemsPromise = getQuoteListPageForBusiness({
    businessId: businessContext.business.id,
    filters: { view: "archived", status: "all", sort: "newest" },
    page: 1,
    pageSize: 50,
  });

  return (
    <QuoteListHeaderActions
      businessSlug={businessSlug}
      canExport={canExport}
      filters={filters}
      searchParams={resolvedSearchParams}
      totalItemsPromise={quoteCountPromise}
      archivedItemsPromise={archivedItemsPromise}
      restoreAction={restoreArchivedQuoteAction}
    />
  );
}

// ---------------------------------------------------------------------------
// Controls region — resolves context and passes data to controls section
// ---------------------------------------------------------------------------

async function QuotesControlsRegion({
  params,
  searchParams,
}: QuotesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const parsedFilters = quoteListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        view: "active" as const,
        status: "all" as const,
        sort: "newest" as const,
        page: 1,
      };
  const baseFilters = {
    q: filters.q,
    view: filters.view,
    status: filters.status,
    sort: filters.sort,
  };

  const canExport = hasFeatureAccess(
    businessContext.business.plan,
    "exports",
  );

  const quoteCountPromise = getQuoteListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });
  const archivedItemsPromise = getQuoteListPageForBusiness({
    businessId: businessContext.business.id,
    filters: { view: "archived", status: "all", sort: "newest" },
    page: 1,
    pageSize: 50,
  });

  return (
    <QuoteListControlsSection
      businessSlug={businessSlug}
      canExport={canExport}
      filters={filters}
      searchParams={resolvedSearchParams}
      totalItemsPromise={quoteCountPromise}
      archivedItemsPromise={archivedItemsPromise}
      restoreAction={restoreArchivedQuoteAction}
    />
  );
}

// ---------------------------------------------------------------------------
// List region — resolves context and passes page data to content section
// ---------------------------------------------------------------------------

async function QuotesListRegion({
  params,
  searchParams,
}: QuotesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const parsedFilters = quoteListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        view: "active" as const,
        status: "all" as const,
        sort: "newest" as const,
        page: 1,
      };
  const baseFilters = {
    q: filters.q,
    view: filters.view,
    status: filters.status,
    sort: filters.sort,
  };

  const quoteCountPromise = getQuoteListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });
  const quotePageDataPromise = quoteCountPromise.then(async (totalItems) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, filters.page), totalPages);
    const cachedPageNumbers = totalItems
      ? getCachedPageWindow(currentPage, totalPages)
      : [];
    const cachedPageEntries = await Promise.all(
      cachedPageNumbers.map(async (page) => [
        page,
        await getQuoteListPageForBusiness({
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
  const clearFiltersPath = (() => {
    const params = new URLSearchParams();

    if (filters.view !== "active") {
      params.set("view", filters.view);
    }

    return params.size
      ? `${getBusinessQuotesPath(businessSlug)}?${params.toString()}`
      : getBusinessQuotesPath(businessSlug);
  })();

  return (
    <QuoteListContentSection
      businessSlug={businessSlug}
      clearFiltersPath={clearFiltersPath}
      filters={filters}
      hasNonViewFilters={hasNonViewFilters}
      pageDataPromise={quotePageDataPromise}
      searchParams={resolvedSearchParams}
      totalItemsPromise={quoteCountPromise}
    />
  );
}
