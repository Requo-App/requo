import Link from "next/link";
import { BellRing } from "lucide-react";

import { DataListPagination } from "@/components/shared/data-list-pagination";
import {
  DashboardEmptyState,
} from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowUpListClient } from "@/features/follow-ups/components/follow-up-list-client";
import type { TeamMemberOption } from "@/features/follow-ups/components/follow-up-reassign-dialog";
import { FollowUpListFilters } from "@/features/follow-ups/components/follow-up-list-filters";
import type { FollowUpListFilters as FollowUpListFiltersValue, FollowUpView } from "@/features/follow-ups/types";
import { getBusinessFollowUpsPath } from "@/features/businesses/routes";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type FollowUpListControlsSectionProps = {
  filters: FollowUpListFiltersValue;
  totalItemsPromise: Promise<number>;
};

export async function FollowUpListControlsSection({
  filters,
  totalItemsPromise,
}: FollowUpListControlsSectionProps) {
  const totalItems = await totalItemsPromise;

  return <FollowUpListFilters filters={filters} resultCount={totalItems} />;
}

type FollowUpListContentSectionProps = {
  businessName?: string;
  businessSlug: string;
  clearFiltersPath: string;
  filters: FollowUpListFiltersValue;
  followUpsPromise: Promise<FollowUpView[]>;
  hasFilters: boolean;
  members?: TeamMemberOption[];
  searchParams: SearchParamsRecord;
  totalItemsPromise: Promise<number>;
  totalPages: number;
  currentPage: number;
};

export async function FollowUpListContentSection({
  businessName,
  businessSlug,
  clearFiltersPath,
  filters,
  followUpsPromise,
  hasFilters,
  members = [],
  searchParams,
  totalItemsPromise,
  totalPages,
  currentPage,
}: FollowUpListContentSectionProps) {
  const [followUps, totalItems] = await Promise.all([
    followUpsPromise,
    totalItemsPromise,
  ]);

  if (!totalItems) {
    return (
      <DashboardEmptyState
        action={
          hasFilters ? (
            <Button asChild variant="outline">
              <Link href={clearFiltersPath} prefetch={true}>
                Clear filters
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={getBusinessFollowUpsPath(businessSlug)} prefetch={true}>
                View pending follow-ups
              </Link>
            </Button>
          )
        }
        description={
          hasFilters
            ? "Try another search, status, or due date."
            : filters.status === "pending"
              ? "No action needed today. New quote and inquiry follow-ups will appear in To do."
              : filters.status === "all"
                ? "Nothing here yet. Set a follow-up from an inquiry or quote to start the list."
                : "Done and dismissed follow-ups will show here as you work the queue."
        }
        icon={BellRing}
        title={
          hasFilters
            ? "No follow-ups match these filters."
            : filters.due === "today"
              ? "No follow-ups due today."
              : "No follow-ups"
        }
        variant="list"
      />
    );
  }

  return (
    <>
      <FollowUpListClient
        initialFollowUps={followUps}
        businessName={businessName}
        businessSlug={businessSlug}
        members={members}
      />
      <DataListPagination
        currentPage={currentPage}
        pathname={getBusinessFollowUpsPath(businessSlug)}
        searchParams={searchParams}
        totalItems={totalItems}
        totalPages={totalPages}
      />
    </>
  );
}

export function FollowUpListControlsFallback() {
  return (
    <div className="data-list-toolbar-strip" aria-hidden="true">
      <div className="data-list-toolbar-grid">
        <Skeleton className="h-9 min-w-0 flex-1 rounded-md sm:h-8" />
        <Skeleton className="hidden h-9 min-w-0 flex-1 rounded-md sm:block sm:h-8" />
        <Skeleton className="hidden h-9 w-32 rounded-md sm:block sm:h-8" />
        <Skeleton className="h-9 w-20 shrink-0 rounded-md sm:h-8" />
      </div>
      <Skeleton className="h-4 w-28 rounded-md" />
    </div>
  );
}

export function FollowUpListContentFallback() {
  return (
    <div className="flex min-h-[320px] flex-col gap-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-4 py-3 sm:px-5"
          key={index}
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32 rounded-md" />
            <Skeleton className="h-3 w-48 rounded-md" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
