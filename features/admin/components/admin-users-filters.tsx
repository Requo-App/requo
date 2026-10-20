"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { DataListToolbar } from "@/components/shared/data-list-toolbar";
import { useProgressRouter } from "@/hooks/use-progress-router";
import type { AdminUsersListFilters } from "@/features/admin/schemas";

type StatusFilterValue = NonNullable<AdminUsersListFilters["status"]>;

const ALL_STATUS: StatusFilterValue = "all";

const statusFilterOptions: Array<{ label: string; value: StatusFilterValue }> = [
  { label: "All users", value: "all" },
  { label: "Verified", value: "verified" },
  { label: "Unverified", value: "unverified" },
  { label: "Suspended", value: "suspended" },
];

type AdminUsersFiltersProps = {
  filters: AdminUsersListFilters;
  resultCount: number;
};

export function AdminUsersFilters({
  filters,
  resultCount,
}: AdminUsersFiltersProps) {
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
      description="Search by email or name. Filter by account status."
      filterId="admin-users-status-filter"
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
      resultLabel={`${resultCount} ${resultCount === 1 ? "user" : "users"}`}
      searchId="admin-users-search"
      searchLabel="Search users"
      searchPlaceholder="Search by email or name"
      searchValue={query}
    />
  );
}
