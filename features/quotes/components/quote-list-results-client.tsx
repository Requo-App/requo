"use client";

import { useCallback, useMemo, useState } from "react";

import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { DataListPagination } from "@/components/shared/data-list-pagination";
import { QuoteBulkActions } from "@/features/quotes/components/quote-bulk-actions";
import { QuoteListCards } from "@/features/quotes/components/quote-list-cards";
import { QuoteListTable } from "@/features/quotes/components/quote-list-table";
import { getBusinessQuotesPath } from "@/features/businesses/routes";
import type { DashboardQuoteListItem } from "@/features/quotes/types";
import { useAnimatedList } from "@/hooks/use-animated-list";
import { useBulkSelection } from "@/hooks/use-bulk-selection";

type SearchParamsRecord = Record<string, string | string[] | undefined>;
const EMPTY_PAGE_CACHE: Record<number, DashboardQuoteListItem[]> = {};

function normalizePageCache(
  cachedPages: Record<number, DashboardQuoteListItem[]> | null | undefined,
) {
  return cachedPages && typeof cachedPages === "object"
    ? cachedPages
    : EMPTY_PAGE_CACHE;
}

type QuoteListResultsClientProps = {
  businessSlug: string;
  cachedPages?: Record<number, DashboardQuoteListItem[]> | null;
  currentPage: number;
  searchParams: SearchParamsRecord;
  totalItems: number;
  totalPages: number;
};

export function QuoteListResultsClient({
  businessSlug,
  cachedPages,
  currentPage,
  searchParams,
  totalItems,
  totalPages,
}: QuoteListResultsClientProps) {
  const effectiveCachedPages = useMemo(
    () => normalizePageCache(cachedPages),
    [cachedPages],
  );
  const [visiblePage, setVisiblePage] = useState(currentPage);
  const displayPage = effectiveCachedPages[visiblePage]
    ? visiblePage
    : currentPage;

  const quotesFromCache = useMemo(
    () => effectiveCachedPages[displayPage] ?? [],
    [displayPage, effectiveCachedPages],
  );

  const { items: quotes, getMotionState, getItemRef, removeItems } = useAnimatedList(quotesFromCache);
  const cachedPageNumbers = useMemo(
    () =>
      Object.keys(effectiveCachedPages)
        .map((page) => Number(page))
        .filter((page) => Number.isInteger(page)),
    [effectiveCachedPages],
  );

  const {
    selectedCount,
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    isAtLimit,
    serializedIds,
    allSelected,
  } = useBulkSelection(quotes);

  const allOnPageSelected = quotes.length > 0 && allSelected(quotes.map((q) => q.id));

  const handleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      deselectAll();
    } else {
      selectAll(quotes.map((q) => q.id));
    }
  };

  const handleSelectAllMatchingFilters = () => {
    const allMatchingIds = Object.values(effectiveCachedPages).flatMap(
      (pageItems) => pageItems.map((item) => item.id),
    );

    // Default max selection is 50 in useBulkSelection
    const MAX_BULK_SELECTION = 50;

    if (allMatchingIds.length > MAX_BULK_SELECTION) {
      selectAll(allMatchingIds.slice(0, MAX_BULK_SELECTION));
    } else {
      selectAll(allMatchingIds);
    }
  };

  const handleBulkComplete = useCallback(() => {
    deselectAll();
  }, [deselectAll]);

  return (
    <>
      <BulkActionBar
        selectedCount={selectedCount}
        totalOnPage={quotes.length}
        totalMatchingFilters={totalItems}
        maxSelection={50}
        allOnPageSelected={allOnPageSelected}
        onSelectAllOnPage={handleSelectAllOnPage}
        onSelectAllMatchingFilters={handleSelectAllMatchingFilters}
        onDeselectAll={deselectAll}
      >
        <QuoteBulkActions
          selectedCount={selectedCount}
          serializedIds={serializedIds}
          quotes={quotes}
          onComplete={handleBulkComplete}
          onOptimisticRemove={removeItems}
        />
      </BulkActionBar>
      <QuoteListCards
        quotes={quotes}
        businessSlug={businessSlug}
        isSelected={isSelected}
        isAtLimit={isAtLimit}
        onToggle={toggle}
        getMotionState={getMotionState}
        getItemRef={getItemRef}
      />
      <QuoteListTable
        quotes={quotes}
        businessSlug={businessSlug}
        isSelected={isSelected}
        isAtLimit={isAtLimit}
        onToggle={toggle}
        allOnPageSelected={allOnPageSelected}
        onSelectAllOnPage={handleSelectAllOnPage}
        getMotionState={getMotionState}
        getItemRef={getItemRef}
      />
      <DataListPagination
        cachedPages={cachedPageNumbers}
        currentPage={displayPage}
        onCachedPageNavigate={setVisiblePage}
        pathname={getBusinessQuotesPath(businessSlug)}
        searchParams={searchParams}
        totalItems={totalItems}
        totalPages={totalPages}
      />
    </>
  );
}
