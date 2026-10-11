"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "@/components/shared/notify";

import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { DataListPagination } from "@/components/shared/data-list-pagination";
import { InvoiceBulkActions } from "@/features/invoices/components/invoice-bulk-actions";
import { InvoiceListCards } from "@/features/invoices/components/invoice-list-cards";
import { InvoiceListTable } from "@/features/invoices/components/invoice-list-table";
import { getBusinessInvoicesPath } from "@/features/businesses/routes";
import type { InvoiceListItem } from "@/features/invoices/types";
import { useAnimatedList } from "@/hooks/use-animated-list";
import { useBulkSelection } from "@/hooks/use-bulk-selection";

type SearchParamsRecord = Record<string, string | string[] | undefined>;
const EMPTY_PAGE_CACHE: Record<number, InvoiceListItem[]> = {};
const MAX_BULK_SELECTION = 50;

function normalizePageCache(
  cachedPages: Record<number, InvoiceListItem[]> | null | undefined,
) {
  return cachedPages && typeof cachedPages === "object"
    ? cachedPages
    : EMPTY_PAGE_CACHE;
}

type InvoiceListResultsClientProps = {
  businessSlug: string;
  cachedPages?: Record<number, InvoiceListItem[]> | null;
  currentPage: number;
  searchParams: SearchParamsRecord;
  totalItems: number;
  totalPages: number;
};

export function InvoiceListResultsClient({
  businessSlug,
  cachedPages,
  currentPage,
  searchParams,
  totalItems,
  totalPages,
}: InvoiceListResultsClientProps) {
  const effectiveCachedPages = useMemo(
    () => normalizePageCache(cachedPages),
    [cachedPages],
  );
  const [visiblePage, setVisiblePage] = useState(currentPage);
  const displayPage = effectiveCachedPages[visiblePage]
    ? visiblePage
    : currentPage;

  const invoicesFromCache = useMemo(
    () => effectiveCachedPages[displayPage] ?? [],
    [displayPage, effectiveCachedPages],
  );

  const { items: invoices, getMotionState, getItemRef, removeItems } = useAnimatedList(invoicesFromCache);
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
  } = useBulkSelection(invoices);

  const allOnPageSelected = invoices.length > 0 && allSelected(invoices.map((invoice) => invoice.id));

  const handleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      deselectAll();
    } else {
      selectAll(invoices.map((invoice) => invoice.id));
    }
  };

  const handleSelectAllMatchingFilters = () => {
    const allMatchingIds = Object.values(effectiveCachedPages).flatMap(
      (pageItems) => pageItems.map((item) => item.id),
    );

    if (allMatchingIds.length > MAX_BULK_SELECTION) {
      selectAll(allMatchingIds.slice(0, MAX_BULK_SELECTION));
      toast.info(
        `Selection capped at ${MAX_BULK_SELECTION} items. ${allMatchingIds.length - MAX_BULK_SELECTION} items could not be selected.`,
      );
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
        totalOnPage={invoices.length}
        totalMatchingFilters={totalItems}
        maxSelection={MAX_BULK_SELECTION}
        allOnPageSelected={allOnPageSelected}
        onSelectAllOnPage={handleSelectAllOnPage}
        onSelectAllMatchingFilters={handleSelectAllMatchingFilters}
        onDeselectAll={deselectAll}
      >
        <InvoiceBulkActions
          selectedCount={selectedCount}
          serializedIds={serializedIds}
          invoices={invoices}
          onComplete={handleBulkComplete}
          onOptimisticRemove={removeItems}
        />
      </BulkActionBar>
      <InvoiceListCards
        invoices={invoices}
        businessSlug={businessSlug}
        isSelected={isSelected}
        isAtLimit={isAtLimit}
        onToggle={toggle}
        getMotionState={getMotionState}
        getItemRef={getItemRef}
      />
      <InvoiceListTable
        invoices={invoices}
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
        pathname={getBusinessInvoicesPath(businessSlug)}
        searchParams={searchParams}
        totalItems={totalItems}
        totalPages={totalPages}
      />
    </>
  );
}
