"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "@/components/shared/notify";
import {
  getLocallyViewedInquiriesServerSnapshot,
  getLocallyViewedInquiriesSnapshot,
  subscribeLocallyViewedInquiries,
} from "@/features/inquiries/components/inquiry-viewed-store";

import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { DataListPagination } from "@/components/shared/data-list-pagination";
import { InquiryBulkActions } from "@/features/inquiries/components/inquiry-bulk-actions";


import { InquiryListCards } from "@/features/inquiries/components/inquiry-list-cards";
import { InquiryListTable } from "@/features/inquiries/components/inquiry-list-table";
import { getBusinessInquiriesPath } from "@/features/businesses/routes";
import type { DashboardInquiryListItem } from "@/features/inquiries/types";
import { useAnimatedList } from "@/hooks/use-animated-list";
import { useBulkSelection } from "@/hooks/use-bulk-selection";

type SearchParamsRecord = Record<string, string | string[] | undefined>;
const EMPTY_PAGE_CACHE: Record<number, DashboardInquiryListItem[]> = {};
const MAX_BULK_SELECTION = 50;

function normalizePageCache(
  cachedPages: Record<number, DashboardInquiryListItem[]> | null | undefined,
) {
  return cachedPages && typeof cachedPages === "object"
    ? cachedPages
    : EMPTY_PAGE_CACHE;
}

type InquiryListResultsClientProps = {
  businessSlug: string;
  cachedPages?: Record<number, DashboardInquiryListItem[]> | null;
  currentPage: number;
  searchParams: SearchParamsRecord;
  totalItems: number;
  totalPages: number;
};

export function InquiryListResultsClient({
  businessSlug,
  cachedPages,
  currentPage,
  searchParams,
  totalItems,
  totalPages,
}: InquiryListResultsClientProps) {
  const effectiveCachedPages = useMemo(
    () => normalizePageCache(cachedPages),
    [cachedPages],
  );
  const [visiblePage, setVisiblePage] = useState(currentPage);
  const displayPage = effectiveCachedPages[visiblePage]
    ? visiblePage
    : currentPage;

  const inquiriesFromCache = useMemo(
    () => effectiveCachedPages[displayPage] ?? [],
    [displayPage, effectiveCachedPages],
  );

  // Instant read state on back navigation: ids marked viewed by the detail
  // tracker render as read immediately. useSyncExternalStore uses the empty
  // server snapshot during hydration (no mismatch) and syncs to the client
  // snapshot right after — no skeleton wait, no transition-rule violations.
  const locallyViewedIds = useSyncExternalStore(
    subscribeLocallyViewedInquiries,
    getLocallyViewedInquiriesSnapshot,
    getLocallyViewedInquiriesServerSnapshot,
  );

  const effectiveInquiriesFromCache = useMemo(() => {
    if (locallyViewedIds.length === 0) {
      return inquiriesFromCache;
    }

    const viewed = new Set(locallyViewedIds);
    let changed = false;
    const next = inquiriesFromCache.map((item) => {
      if (item.isUnread && viewed.has(item.id)) {
        changed = true;
        return { ...item, isUnread: false };
      }

      return item;
    });

    return changed ? next : inquiriesFromCache;
  }, [inquiriesFromCache, locallyViewedIds]);

  const {
    items: inquiries,
    getMotionState,
    removeItems,
  } = useAnimatedList(effectiveInquiriesFromCache);

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
  } = useBulkSelection(inquiries);

  const allOnPageSelected = inquiries.length > 0 && allSelected(inquiries.map((i) => i.id));

  const handleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      deselectAll();
    } else {
      selectAll(inquiries.map((i) => i.id));
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
        totalOnPage={inquiries.length}
        totalMatchingFilters={totalItems}
        maxSelection={MAX_BULK_SELECTION}
        allOnPageSelected={allOnPageSelected}
        onSelectAllOnPage={handleSelectAllOnPage}
        onSelectAllMatchingFilters={handleSelectAllMatchingFilters}
        onDeselectAll={deselectAll}
      >
        <InquiryBulkActions
          selectedCount={selectedCount}
          serializedIds={serializedIds}
          onComplete={handleBulkComplete}
          onOptimisticRemove={removeItems}
        />
      </BulkActionBar>
      <InquiryListCards
        inquiries={inquiries}
        businessSlug={businessSlug}
        isSelected={isSelected}
        isAtLimit={isAtLimit}
        onToggle={toggle}
        getMotionState={getMotionState}
      />
      <InquiryListTable
        inquiries={inquiries}
        businessSlug={businessSlug}
        isSelected={isSelected}
        isAtLimit={isAtLimit}
        onToggle={toggle}
        allOnPageSelected={allOnPageSelected}
        onSelectAllOnPage={handleSelectAllOnPage}
        getMotionState={getMotionState}
      />
      <DataListPagination
        cachedPages={cachedPageNumbers}
        currentPage={displayPage}
        onCachedPageNavigate={setVisiblePage}
        pathname={getBusinessInquiriesPath(businessSlug)}
        searchParams={searchParams}
        totalItems={totalItems}
        totalPages={totalPages}
      />
    </>
  );
}
