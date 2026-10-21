"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { DataListToolbar } from "@/components/shared/data-list-toolbar";
import { useProgressRouter } from "@/hooks/use-progress-router";
import type {
  FollowUpDueFilterValue,
  FollowUpListFilters,
  FollowUpSortValue,
  FollowUpStatusFilterValue,
} from "@/features/follow-ups/types";
import {
  followUpDueFilterValues,
  followUpSortValues,
  followUpStatusFilterValues,
} from "@/features/follow-ups/types";
import {
  followUpDueBucketLabels,
  followUpStatusLabels,
} from "@/features/follow-ups/utils";

type FollowUpListFiltersProps = {
  filters: FollowUpListFilters;
  resultCount: number;
};

const statusOptions: FollowUpStatusFilterValue[] = [
  ...followUpStatusFilterValues,
];
const dueOptions: FollowUpDueFilterValue[] = [...followUpDueFilterValues];
const sortOptions: FollowUpSortValue[] = [...followUpSortValues];

export function FollowUpListFilters({
  filters,
  resultCount,
}: FollowUpListFiltersProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useProgressRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q ?? "");
  const [status, setStatus] = useState<FollowUpStatusFilterValue>(filters.status);
  const [due, setDue] = useState<FollowUpDueFilterValue>(filters.due);
  const [sort, setSort] = useState<FollowUpSortValue>(filters.sort);
  const hasMountedRef = useRef(false);
  const lastAppliedHrefRef = useRef<string>("");

  const navigate = useCallback(
    (
      nextQuery: string,
      nextStatus: FollowUpStatusFilterValue,
      nextDue: FollowUpDueFilterValue,
      nextSort: FollowUpSortValue,
    ) => {
      const params = new URLSearchParams();
      const trimmedQuery = nextQuery.trim();

      // The list view is marked explicitly so dropping the (default) pending
      // status filter cannot bounce the owner back to the board.
      params.set("view", "list");

      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      if (nextStatus !== "all") {
        params.set("status", nextStatus);
      }

      if (nextDue !== "all") {
        params.set("due", nextDue);
      }

      if (nextSort !== "due_asc") {
        params.set("sort", nextSort);
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

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const timer = setTimeout(() => {
      navigate(query, status, due, sort);
    }, 400);

    return () => clearTimeout(timer);
  }, [due, navigate, query, sort, status]);

  return (
    <DataListToolbar
      canClear={Boolean(
        query.trim() ||
          status !== "all" ||
          due !== "all" ||
          sort !== "due_asc",
      )}
      description="Search by customer, quote, inquiry, or follow-up reason."
      filterId="follow-up-status-filter"
      filterLabel="Status"
      filterOptions={statusOptions.map((option) => ({
        value: option,
        label:
          option === "all" ? "All statuses" : followUpStatusLabels[option],
      }))}
      filterValue={status}
      isPending={isPending}
      onClear={() => {
        setQuery("");
        setStatus("all");
        setDue("all");
        setSort("due_asc");
        navigate("", "all", "all", "due_asc");
      }}
      onFilterChange={(value) => {
        const nextStatus = value as FollowUpStatusFilterValue;
        setStatus(nextStatus);
        navigate(query, nextStatus, due, sort);
      }}
      onSearchChange={setQuery}
      onSecondaryFilterChange={(value) => {
        const nextDue = value as FollowUpDueFilterValue;
        setDue(nextDue);
        navigate(query, status, nextDue, sort);
      }}
      onSortChange={(value) => {
        const nextSort = value as FollowUpSortValue;
        setSort(nextSort);
        navigate(query, status, due, nextSort);
      }}
      resultLabel={`${resultCount} ${resultCount === 1 ? "follow-up" : "follow-ups"}`}
      searchId="follow-up-search"
      searchLabel="Search follow-ups"
      searchPlaceholder="Search customer, quote, inquiry, or reason"
      searchValue={query}
      secondaryFilterId="follow-up-due-filter"
      secondaryFilterLabel="Due"
      secondaryFilterOptions={dueOptions.map((option) => ({
        value: option,
        label:
          option === "all"
            ? "All due dates"
            : followUpDueBucketLabels[option],
      }))}
      secondaryFilterValue={due}
      sortId="follow-up-sort"
      sortLabel="Sort by"
      sortOptions={sortOptions.map((option) => ({
        value: option,
        label:
          option === "due_asc"
            ? "Due soonest"
            : option === "due_desc"
              ? "Due latest"
              : "Newest first",
      }))}
      sortValue={sort}
    />
  );
}
