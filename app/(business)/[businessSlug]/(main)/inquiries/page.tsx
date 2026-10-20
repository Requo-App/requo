import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  InquiryListContentFallback,
  InquiryListContentSection,
  InquiryListControlsFallback,
  InquiryListControlsSection,
  InquiryListHeaderActions,
  InquiryListHeaderActionsFallback,
} from "@/features/inquiries/components/inquiry-list-page-sections";
import { inquiryListFiltersSchema } from "@/features/inquiries/schemas";
import {
  getBusinessInquiryFormOptionsForBusiness,
  getInquiryListCountForBusiness,
  getInquiryListPageForBusiness,
} from "@/features/inquiries/queries";
import { unarchiveInquiryAction } from "@/features/inquiries/actions";
import {
  getBusinessInquiriesPath,
} from "@/features/businesses/routes";
import { getAppShellContext } from "@/lib/app-shell/context";
import { getCachedPageWindow } from "@/lib/pagination";
import { hasFeatureAccess } from "@/lib/plans";
import { createNoIndexMetadata } from "@/lib/seo/site";

type InquiriesPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ITEMS_PER_PAGE = 10;

/**
 * Resolves list filters from the URL. `unread` is always forced off — the
 * "Unread only" filter chip was removed, so a stale `?unread=1` param must
 * not keep filtering the list. Unread tracking itself (nav badge, list
 * dot/bold) is untouched.
 */
function resolveInquiryListFilters(
  resolvedSearchParams: Record<string, string | string[] | undefined>,
) {
  const parsedFilters = inquiryListFiltersSchema.safeParse(resolvedSearchParams);
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        view: "active" as const,
        status: "all" as const,
        form: "all",
        source: "all" as const,
        sort: "newest" as const,
        escalated: false,
        unread: false,
        page: 1,
      };

  return { ...filters, unread: false as const };
}

export const metadata: Metadata = createNoIndexMetadata({
  title: "Inquiries",
  description: "List, filter, and manage inquiries for this business.",
});

export const instant = true;

/**
 * Inquiries list page — non-blocking structural shell.
 *
 * Returns the DashboardPage shell and skeleton fallbacks synchronously.
 * All dynamic reads (params, searchParams, getAppShellContext, queries)
 * are resolved inside Suspense-wrapped child server components.
 */
export default function InquiriesPage({
  params,
  searchParams,
}: InquiriesPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Inquiries"
        className="[&_.dashboard-actions]:max-lg:hidden"
        actions={
          <Suspense fallback={<InquiryListHeaderActionsFallback />}>
            <InquiriesHeaderActionsRegion params={params} searchParams={searchParams} />
          </Suspense>
        }
      />

      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<InquiryListControlsFallback />}>
          <InquiriesControlsRegion params={params} searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<InquiryListContentFallback />}>
          <InquiriesListRegion params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Header actions region — page-level actions hoisted into PageHeader
// ---------------------------------------------------------------------------

async function InquiriesHeaderActionsRegion({
  params,
  searchParams,
}: InquiriesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const filters = resolveInquiryListFilters(resolvedSearchParams);
  const baseFilters = {
    q: filters.q,
    view: filters.view,
    status: filters.status,
    form: filters.form,
    source: filters.source,
    sort: filters.sort,
    escalated: filters.escalated ?? false,
    unread: false,
  };

  const canExport = hasFeatureAccess(
    businessContext.business.plan,
    "exports",
  );

  const inquiryCountPromise = getInquiryListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });
  // The CSV export carries its own filters, so the list's filtered count
  // cannot say whether an export would return rows. This is the
  // business-wide count used to decide whether the export is offered.
  const exportableInquiryCountPromise = getInquiryListCountForBusiness({
    businessId: businessContext.business.id,
    filters: {
      view: "active",
      status: "all",
      form: "all",
      source: "all",
      sort: "newest",
      escalated: false,
      unread: false,
    },
  });
  const inquiryFormOptionsPromise = getBusinessInquiryFormOptionsForBusiness(
    businessContext.business.id,
  );
  const archivedItemsPromise = getInquiryListPageForBusiness({
    businessId: businessContext.business.id,
    filters: { view: "archived", status: "all", form: "all", source: "all", sort: "newest", escalated: false, unread: false },
    page: 1,
    pageSize: 50,
  });

  return (
    <InquiryListHeaderActions
      businessSlug={businessSlug}
      canExport={canExport}
      filters={filters}
      formOptionsPromise={inquiryFormOptionsPromise}
      archivedItemsPromise={archivedItemsPromise}
      exportableInquiryCountPromise={exportableInquiryCountPromise}
      unarchiveAction={unarchiveInquiryAction}
      searchParams={resolvedSearchParams}
      totalItemsPromise={inquiryCountPromise}
    />
  );
}

// ---------------------------------------------------------------------------
// Controls region — resolves context and passes data to controls section
// ---------------------------------------------------------------------------

async function InquiriesControlsRegion({
  params,
  searchParams,
}: InquiriesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const filters = resolveInquiryListFilters(resolvedSearchParams);
  const baseFilters = {
    q: filters.q,
    view: filters.view,
    status: filters.status,
    form: filters.form,
    source: filters.source,
    sort: filters.sort,
    escalated: filters.escalated ?? false,
    unread: false,
  };

  const canExport = hasFeatureAccess(
    businessContext.business.plan,
    "exports",
  );

  const inquiryCountPromise = getInquiryListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });
  const inquiryFormOptionsPromise = getBusinessInquiryFormOptionsForBusiness(
    businessContext.business.id,
  );

  return (
    <InquiryListControlsSection
      businessSlug={businessSlug}
      canExport={canExport}
      filters={filters}
      formOptionsPromise={inquiryFormOptionsPromise}
      unarchiveAction={unarchiveInquiryAction}
      searchParams={resolvedSearchParams}
      totalItemsPromise={inquiryCountPromise}
    />
  );
}

// ---------------------------------------------------------------------------
// List region — resolves context and passes page data to content section
// ---------------------------------------------------------------------------

async function InquiriesListRegion({
  params,
  searchParams,
}: InquiriesPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);

  const filters = resolveInquiryListFilters(resolvedSearchParams);
  const baseFilters = {
    q: filters.q,
    view: filters.view,
    status: filters.status,
    form: filters.form,
    source: filters.source,
    sort: filters.sort,
    escalated: filters.escalated ?? false,
    unread: false,
  };

  const inquiryCountPromise = getInquiryListCountForBusiness({
    businessId: businessContext.business.id,
    filters: baseFilters,
  });
  const inquiryPageDataPromise = inquiryCountPromise.then(async (totalItems) => {
    const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, filters.page), totalPages);
    const cachedPageNumbers = totalItems
      ? getCachedPageWindow(currentPage, totalPages)
      : [];
    const cachedPageEntries = await Promise.all(
      cachedPageNumbers.map(async (page) => [
        page,
        await getInquiryListPageForBusiness({
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
    baseFilters.q ||
      baseFilters.status !== "all" ||
      baseFilters.form !== "all" ||
      baseFilters.source !== "all" ||
      baseFilters.sort !== "newest" ||
      baseFilters.escalated,
  );
  const clearFiltersPath = (() => {
    const params = new URLSearchParams();

    if (filters.view !== "active") {
      params.set("view", filters.view);
    }

    return params.size
      ? `${getBusinessInquiriesPath(businessSlug)}?${params.toString()}`
      : getBusinessInquiriesPath(businessSlug);
  })();

  return (
    <InquiryListContentSection
      businessSlug={businessSlug}
      clearFiltersPath={clearFiltersPath}
      filters={filters}
      hasNonViewFilters={hasNonViewFilters}
      pageDataPromise={inquiryPageDataPromise}
      searchParams={resolvedSearchParams}
      totalItemsPromise={inquiryCountPromise}
    />
  );
}
