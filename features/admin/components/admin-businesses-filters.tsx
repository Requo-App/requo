"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { DataListToolbar } from "@/components/shared/data-list-toolbar";
import { useProgressRouter } from "@/hooks/use-progress-router";
import type { AdminBusinessesListFilters } from "@/features/admin/schemas";
import { planTiers, planMeta, type PlanTier } from "@/lib/plans";

/**
 * URL-driven toolbar for `/admin/businesses`.
 *
 * Mirrors the search + filter pattern from `inquiry-list-filters.tsx`
 * and `follow-up-list-filters.tsx`: local state is debounced into
 * `router.replace` so `q` + `plan` are surfaced as shareable query
 * params. Page resets to the first page on any filter change so the
 * server query is never asked for a page that falls outside the new
 * result set.
 */
type AdminBusinessesFiltersProps = {
  filters: AdminBusinessesListFilters;
  resultCount: number;
};

type PlanFilterValue = PlanTier | "all";

const ALL_PLANS: PlanFilterValue = "all";

const planFilterOptions: Array<{ label: string; value: PlanFilterValue }> = [
  { label: "All plans", value: ALL_PLANS },
  ...planTiers.map((plan) => ({
    label: planMeta[plan].label,
    value: plan satisfies PlanFilterValue,
  })),
];

function toPlanFilterValue(
  plan: AdminBusinessesListFilters["plan"],
): PlanFilterValue {
  return plan ?? ALL_PLANS;
}

export function AdminBusinessesFilters({
  filters,
  resultCount,
}: AdminBusinessesFiltersProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useProgressRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.search ?? "");
  const [plan, setPlan] = useState<PlanFilterValue>(
    toPlanFilterValue(filters.plan),
  );

  const hasMountedRef = useRef(false);
  const lastAppliedHrefRef = useRef<string>("");

  const navigate = useCallback(
    (nextQuery: string, nextPlan: PlanFilterValue) => {
      const params = new URLSearchParams();
      const trimmedQuery = nextQuery.trim();

      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      if (nextPlan !== ALL_PLANS) {
        params.set("plan", nextPlan);
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
      navigate(query, plan);
    }, 400);

    return () => clearTimeout(timer);
  }, [navigate, plan, query]);

  return (
    <DataListToolbar
      canClear={Boolean(query.trim() || plan !== ALL_PLANS)}
      description="Search by business name or slug. Records are always ordered newest first."
      filterId="admin-business-plan-filter"
      filterLabel="Plan"
      filterOptions={planFilterOptions}
      filterValue={plan}
      isPending={isPending}
      onClear={() => {
        setQuery("");
        setPlan(ALL_PLANS);
        navigate("", ALL_PLANS);
      }}
      onFilterChange={(value) => {
        const nextPlan = value as PlanFilterValue;
        setPlan(nextPlan);
        navigate(query, nextPlan);
      }}
      onSearchChange={setQuery}
      resultLabel={`${resultCount} ${resultCount === 1 ? "business" : "businesses"}`}
      searchId="admin-business-search"
      searchLabel="Search businesses"
      searchPlaceholder="Search by name or slug"
      searchValue={query}
    />
  );
}
