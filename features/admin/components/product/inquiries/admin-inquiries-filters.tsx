"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { DataListToolbar } from "@/components/shared/data-list-toolbar";
import { useProgressRouter } from "@/hooks/use-progress-router";
import type { AdminInquiriesListFilters } from "@/features/admin/schemas";
import { inquiryStatuses, type InquiryStatus } from "@/features/inquiries/types";
import { getInquiryStatusLabel } from "@/features/inquiries/utils";

type StatusFilterValue = InquiryStatus | "all";

const ALL_STATUS: StatusFilterValue = "all";

const statusFilterOptions: Array<{ label: string; value: StatusFilterValue }> = [
  { label: "All statuses", value: ALL_STATUS },
  ...inquiryStatuses.map((status) => ({
    label: getInquiryStatusLabel(status),
    value: status satisfies StatusFilterValue,
  })),
];

type AdminInquiriesFiltersProps = {
  filters: AdminInquiriesListFilters;
  resultCount: number;
};

export function AdminInquiriesFilters({
  filters,
  resultCount,
}: AdminInquiriesFiltersProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useProgressRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.search ?? "");
  const [status, setStatus] = useState<StatusFilterValue>(
    filters.status ?? ALL_STATUS,
  );
  const hasMountedRef = useRef(false);
  const lastAppliedHrefRef = useRef<string>("");

  const navigate = useCallback(
    (nextQuery: string, nextStatus: StatusFilterValue) => {
      const params = new URLSearchParams();
      const trimmed = nextQuery.trim();

      for (const [key, value] of searchParams.entries()) {
        if (key === "q" || key === "search" || key === "page" || key === "status") {
          continue;
        }
        params.append(key, value);
      }

      if (trimmed) {
        params.set("q", trimmed);
      }

      if (nextStatus !== ALL_STATUS) {
        params.set("status", nextStatus);
      }

      const href = params.size ? `${pathname}?${params.toString()}` : pathname;
      const currentHref = searchParams.size
        ? `${pathname}?${searchParams.toString()}`
        : pathname;

      if (href === currentHref || href === lastAppliedHrefRef.current) {
        return;
      }

      lastAppliedHrefRef.current = href;

      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // Sync filter state when the URL (or filters prop) changes without an effect.
  const [prevFilters, setPrevFilters] = useState(filters);
  if (
    filters.search !== prevFilters.search ||
    filters.status !== prevFilters.status
  ) {
    setPrevFilters(filters);
    setQuery(filters.search ?? "");
    setStatus(filters.status ?? ALL_STATUS);
  }

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      navigate(query, status);
    }, 400);

    return () => clearTimeout(timer);
  }, [navigate, query, status]);

  return (
    <DataListToolbar
      canClear={Boolean(query.trim() || status !== ALL_STATUS)}
      description="Search by customer name, email, or subject. Filter by pipeline status."
      filterId="admin-inquiries-status-filter"
      filterLabel="Status"
      filterOptions={statusFilterOptions}
      filterValue={status}
      isPending={isPending}
      onClear={() => {
        setQuery("");
        setStatus(ALL_STATUS);
        navigate("", ALL_STATUS);
      }}
      onFilterChange={(value) => {
        const nextStatus = value as StatusFilterValue;
        setStatus(nextStatus);
        navigate(query, nextStatus);
      }}
      onSearchChange={setQuery}
      resultLabel={`${resultCount} ${resultCount === 1 ? "inquiry" : "inquiries"}`}
      searchId="admin-inquiries-search"
      searchLabel="Search inquiries"
      searchPlaceholder="Search by customer, email, or subject"
      searchValue={query}
    />
  );
}
