"use client";

import { useMemo, useState } from "react";

import { DataListPagination } from "@/components/shared/data-list-pagination";
import { PaymentListCards } from "@/features/invoices/components/payment-list-cards";
import { PaymentListTable } from "@/features/invoices/components/payment-list-table";
import { getBusinessPaymentsPath } from "@/features/businesses/routes";
import type { PaymentListItem } from "@/features/invoices/types";
import { useAnimatedList } from "@/hooks/use-animated-list";

type SearchParamsRecord = Record<string, string | string[] | undefined>;
const EMPTY_PAGE_CACHE: Record<number, PaymentListItem[]> = {};

function normalizePageCache(
  cachedPages: Record<number, PaymentListItem[]> | null | undefined,
) {
  return cachedPages && typeof cachedPages === "object"
    ? cachedPages
    : EMPTY_PAGE_CACHE;
}

type PaymentListResultsClientProps = {
  businessSlug: string;
  cachedPages?: Record<number, PaymentListItem[]> | null;
  currentPage: number;
  searchParams: SearchParamsRecord;
  totalItems: number;
  totalPages: number;
};

export function PaymentListResultsClient({
  businessSlug,
  cachedPages,
  currentPage,
  searchParams,
  totalItems,
  totalPages,
}: PaymentListResultsClientProps) {
  const effectiveCachedPages = useMemo(
    () => normalizePageCache(cachedPages),
    [cachedPages],
  );
  const [visiblePage, setVisiblePage] = useState(currentPage);
  const displayPage = effectiveCachedPages[visiblePage]
    ? visiblePage
    : currentPage;

  const paymentsFromCache = useMemo(
    () => effectiveCachedPages[displayPage] ?? [],
    [displayPage, effectiveCachedPages],
  );

  const { items: payments, getMotionState, getItemRef } = useAnimatedList(paymentsFromCache);
  const cachedPageNumbers = useMemo(
    () =>
      Object.keys(effectiveCachedPages)
        .map((page) => Number(page))
        .filter((page) => Number.isInteger(page)),
    [effectiveCachedPages],
  );

  return (
    <>
      <PaymentListCards
        payments={payments}
        businessSlug={businessSlug}
        getMotionState={getMotionState}
        getItemRef={getItemRef}
      />
      <PaymentListTable
        payments={payments}
        businessSlug={businessSlug}
        getMotionState={getMotionState}
        getItemRef={getItemRef}
      />
      <DataListPagination
        cachedPages={cachedPageNumbers}
        currentPage={displayPage}
        onCachedPageNavigate={setVisiblePage}
        pathname={getBusinessPaymentsPath(businessSlug)}
        searchParams={searchParams}
        totalItems={totalItems}
        totalPages={totalPages}
      />
    </>
  );
}
