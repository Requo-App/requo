import Link from "next/link";
import { Plus } from "lucide-react";

import { DashboardListResultsSkeleton } from "@/components/shared/dashboard-list-results-skeleton";
import {
  DashboardEmptyState,
} from "@/components/shared/dashboard-layout";
import { MobileHeaderSlot, mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArchivedQuotesSheet } from "@/features/quotes/components/archived-quotes-sheet";
import { QuoteExportCsvDropdown } from "@/features/quotes/components/quote-export-csv-dropdown";
import { QuoteListFilters } from "@/features/quotes/components/quote-list-filters";
import { QuoteListResults } from "@/features/quotes/components/quote-list-results";
import type {
  DashboardQuoteListItem,
  QuoteListFilters as QuoteListFiltersValue,
} from "@/features/quotes/types";
import {
  getBusinessNewQuotePath,
  getBusinessQuotesPath,
} from "@/features/businesses/routes";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type QuoteListResultsData = {
  cachedPages?: Record<number, DashboardQuoteListItem[]> | null;
  currentPage: number;
  filterKey: string;
  totalItems: number;
  totalPages: number;
};

type QuoteRecordActionState = { error?: string; success?: string };

type QuoteListControlsSectionProps = {
  businessSlug: string;
  filters: QuoteListFiltersValue;
  searchParams: SearchParamsRecord;
  totalItemsPromise: Promise<number>;
  archivedItemsPromise: Promise<DashboardQuoteListItem[]>;
  restoreAction: (
    quoteId: string,
    state: QuoteRecordActionState,
    formData: FormData,
  ) => Promise<QuoteRecordActionState>;
};

export async function QuoteListHeaderActions({
  businessSlug,
  filters,
  totalItemsPromise,
  archivedItemsPromise,
  restoreAction,
}: QuoteListControlsSectionProps) {
  const [totalItems, archivedItems] = await Promise.all([
    totalItemsPromise,
    archivedItemsPromise,
  ]);

  return (
    <MobileHeaderSlot>
      <QuoteExportCsvDropdown
        businessSlug={businessSlug}
        filters={filters}
        resultCount={totalItems}
      />
      <ArchivedQuotesSheet
        businessSlug={businessSlug}
        items={archivedItems}
        restoreAction={restoreAction}
      />
      <Button
        asChild
        aria-label="Create quote"
        title="Create quote"
        size="sm"
        className={mobileNavbarIconButtonClassName}
      >
        <Link href={getBusinessNewQuotePath(businessSlug)} prefetch={true}>
          <Plus data-icon="inline-start" />
          <span className="hidden lg:inline">Create</span>
        </Link>
      </Button>
    </MobileHeaderSlot>
  );
}

export async function QuoteListControlsSection({
  businessSlug: _businessSlug,
  filters,
  searchParams: _searchParams,
  totalItemsPromise,
  archivedItemsPromise: _archivedItemsPromise,
  restoreAction: _restoreAction,
}: QuoteListControlsSectionProps) {
  const totalItems = await totalItemsPromise;

  return (
    <QuoteListFilters
      key={`${filters.view}:${filters.status}:${filters.q ?? ""}:${filters.sort}`}
      filters={filters}
      resultCount={totalItems}
    />
  );
}

type QuoteListContentSectionProps = {
  businessSlug: string;
  filters: QuoteListFiltersValue;
  searchParams: SearchParamsRecord;
  totalItemsPromise: Promise<number>;
  pageDataPromise: Promise<QuoteListResultsData>;
  clearFiltersPath: string;
  hasNonViewFilters: boolean;
};

export async function QuoteListContentSection({
  businessSlug,
  filters,
  searchParams,
  totalItemsPromise,
  pageDataPromise,
  clearFiltersPath,
  hasNonViewFilters,
}: QuoteListContentSectionProps) {
  const totalItems = await totalItemsPromise;

  if (totalItems) {
    return (
      <QuoteListResults
        businessSlug={businessSlug}
        pageData={pageDataPromise}
        searchParams={searchParams}
      />
    );
  }

  return (
    <div className="p-4">
    <DashboardEmptyState
      action={
        hasNonViewFilters ? (
          <Button asChild variant="outline">
            <Link href={clearFiltersPath} prefetch={true}>
              Clear filters
            </Link>
          </Button>
        ) : filters.view !== "active" ? (
          <Button asChild variant="outline">
            <Link href={getBusinessQuotesPath(businessSlug)} prefetch={true}>
              View active quotes
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href={getBusinessNewQuotePath(businessSlug)} prefetch={true}>
          <Plus data-icon="inline-start" />
              Create
            </Link>
          </Button>
        )
      }
      description={
        hasNonViewFilters
          ? "Try another search or status."
          : filters.view === "archived"
            ? "Archived quotes stay here until you restore them."
            : "Create a quote manually or send one from an inquiry."
      }
      icon={Plus}
      title={
        hasNonViewFilters
          ? "No quotes match these filters."
          : filters.view === "archived"
            ? "No archived quotes"
            : "Your quote list is still empty."
      }
      variant="list"
    />
    </div>
  );
}

export function QuoteListHeaderActionsFallback() {
  return (
    <>
      <Skeleton className="h-8 w-full rounded-md sm:w-32" />
      <Skeleton className="h-8 w-full rounded-md sm:w-28" />
      <Skeleton className="h-8 w-full rounded-md sm:w-36" />
    </>
  );
}

export function QuoteListControlsFallback() {
  return (
    <div className="data-list-toolbar-strip" aria-hidden="true">
      <div className="data-list-toolbar-grid">
        <Skeleton className="h-9 min-w-0 flex-1 rounded-md sm:h-8" />
        <Skeleton className="hidden h-9 min-w-0 flex-1 rounded-md sm:block sm:h-8" />
        <Skeleton className="hidden h-9 w-32 rounded-md sm:block sm:h-8" />
        <Skeleton className="h-9 w-20 shrink-0 rounded-md sm:h-8" />
      </div>
      <Skeleton className="h-4 w-24 rounded-md" />
    </div>
  );
}

export function QuoteListContentFallback() {
  return <DashboardListResultsSkeleton variant="quotes" />;
}
