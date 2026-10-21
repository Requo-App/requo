import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { getAppShellContext } from "@/lib/app-shell/context";
import {
  getFollowUpHistoryForBusiness,
  getFollowUpOverviewForBusiness,
  getFollowUpListCountForBusiness,
  getFollowUpListPageForBusiness,
  getFollowUpSummaryCountsForBusiness,
  getActiveAutoFollowUpSequencesForBusiness,
  getRecentRecordsForFollowUpCreate,
  getBusinessMembersForReassign,
} from "@/features/follow-ups/queries";
import { FollowUpBoard } from "@/features/follow-ups/components/follow-up-board";
import {
  FollowUpListContentSection,
  FollowUpListControlsSection,
  FollowUpListContentFallback,
  FollowUpListControlsFallback,
} from "@/features/follow-ups/components/follow-up-list-page-sections";
import { CreateFollowUpButton } from "@/features/follow-ups/components/create-follow-up-button";
import { MobileHeaderSlot } from "@/components/shell/mobile-header-slot";
import { LockedAction } from "@/features/paywall";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { FirstVisitTip } from "@/features/onboarding/components/first-visit-tip";
import { featureTips } from "@/features/onboarding/feature-tips";
import { getBusinessFollowUpsPath } from "@/features/businesses/routes";
import { followUpListFiltersSchema } from "@/features/follow-ups/schemas";
import type { FollowUpListFilters } from "@/features/follow-ups/types";

type FollowUpsPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const defaultListFilters: FollowUpListFilters = {
  q: undefined,
  status: "all",
  due: "all",
  sort: "due_asc",
  page: 1,
};

/**
 * Parse the list view's URL filters through the shared schema so a malformed
 * `?page=` falls back to page 1 instead of turning into `offset(NaN)`.
 */
function resolveFollowUpListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FollowUpListFilters {
  const parsed = followUpListFiltersSchema.safeParse(searchParams);

  return parsed.success ? parsed.data : defaultListFilters;
}

export const metadata: Metadata = createNoIndexMetadata({
  title: "Follow-ups",
  description: "Follow up before these quotes go cold.",
});

export const instant = true;

/**
 * Follow-ups page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, searchParams, getAppShellContext, queries) are
 * pushed into a Suspense-wrapped child server component so the static shell
 * is prefetchable and sibling navigations paint instantly.
 *
 * The view mode (board vs list) depends on searchParams, so the branching
 * lives inside the Suspense child.
 */
export default function FollowUpsPage({
  params,
  searchParams,
}: FollowUpsPageProps) {
  return (
    <DashboardPage>
      <PageHeader title="Follow-ups" />

      <FirstVisitTip {...featureTips.followUps} />

      <Suspense fallback={<FollowUpsPageSkeleton />}>
        <FollowUpsContentRegion params={params} searchParams={searchParams} />
      </Suspense>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Suspense-wrapped async child server component
// ---------------------------------------------------------------------------

async function FollowUpsContentRegion({
  params,
  searchParams,
}: FollowUpsPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  // The board is the default workspace. The filterable list is reached
  // explicitly (`?view=list`) or through a status deep link (e.g. the
  // Analytics drill-downs), so every status-filtered link lands on the list.
  const requestedView = resolvedSearchParams.view;
  const hasStatusFilter = Boolean(resolvedSearchParams.status);
  const wantsList =
    requestedView === "list" ||
    (requestedView !== "board" && hasStatusFilter);

  if (wantsList) {
    return (
      <StreamedFollowUpList
        businessSlug={businessSlug}
        searchParams={resolvedSearchParams}
      />
    );
  }

  return <StreamedFollowUpBoard businessSlug={businessSlug} />;
}

async function StreamedFollowUpBoard({ businessSlug }: { businessSlug: string }) {
  const { businessContext } = await getAppShellContext(businessSlug);
  const [overview, recentRecords] = await Promise.all([
    getFollowUpOverviewForBusiness(
      businessContext.business.id,
      businessContext.business.timezone,
    ),
    getRecentRecordsForFollowUpCreate(businessContext.business.id),
  ]);
  const [summaryCounts, autoSequences, history] = await Promise.all([
    getFollowUpSummaryCountsForBusiness(businessContext.business.id, overview),
    getActiveAutoFollowUpSequencesForBusiness(businessContext.business.id),
    getFollowUpHistoryForBusiness({ businessId: businessContext.business.id }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <FollowUpBoard
        overdue={overview.overdue}
        dueToday={overview.dueToday}
        upcoming={overview.upcoming}
        businessSlug={businessSlug}
        autoSequences={autoSequences}
        history={history}
        historyCount={summaryCounts.history}
        createButton={
          <MobileHeaderSlot desktopClassName="flex items-center gap-2">
            <LockedAction feature="followUps" plan={businessContext.business.plan}>
              <CreateFollowUpButton
                businessSlug={businessSlug}
                plan={businessContext.business.plan}
                records={recentRecords}
                timezone={businessContext.business.timezone}
              />
            </LockedAction>
          </MobileHeaderSlot>
        }
      />
    </div>
  );
}

const PAGE_SIZE = 25;

async function StreamedFollowUpList({
  businessSlug,
  searchParams,
}: {
  businessSlug: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { businessContext } = await getAppShellContext(businessSlug);
  const businessId = businessContext.business.id;
  const timezone = businessContext.business.timezone;
  const filters = resolveFollowUpListFilters(searchParams);
  const page = filters.page;

  const hasFilters =
    Boolean(filters.q?.trim()) ||
    filters.due !== "all" ||
    filters.status !== "all";
  const clearFiltersPath = `${getBusinessFollowUpsPath(businessSlug)}?view=list`;

  const [totalItems, members] = await Promise.all([
    getFollowUpListCountForBusiness({ businessId, filters, timezone }),
    getBusinessMembersForReassign(businessId),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const followUpsPromise = getFollowUpListPageForBusiness({
    businessId,
    filters,
    page,
    pageSize: PAGE_SIZE,
    timezone,
  });
  const totalItemsPromise = Promise.resolve(totalItems);

  return (
    <>
      <Suspense fallback={<FollowUpListControlsFallback />}>
        <FollowUpListControlsSection filters={filters} totalItemsPromise={totalItemsPromise} />
      </Suspense>

      <Suspense fallback={<FollowUpListContentFallback />}>
        <FollowUpListContentSection
          businessName={businessContext.business.name}
          businessSlug={businessSlug}
          clearFiltersPath={clearFiltersPath}
          filters={filters}
          followUpsPromise={followUpsPromise}
          hasFilters={hasFilters}
          members={members}
          searchParams={searchParams}
          totalItemsPromise={totalItemsPromise}
          totalPages={totalPages}
          currentPage={page}
        />
      </Suspense>
    </>
  );
}

// ---------------------------------------------------------------------------
// Skeleton fallback
// ---------------------------------------------------------------------------

export function FollowUpsPageSkeleton() {
  return (
    <>
      {/* Search bar placeholder */}
      <div className="relative max-w-sm">
        <Skeleton className="h-9 w-full rounded-md sm:h-8" />
      </div>

      {/* Board columns skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-48 flex-col gap-3 rounded-xl bg-muted/50 p-4"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-4 w-20 rounded-md" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-20 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
