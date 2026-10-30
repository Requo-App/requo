import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  DashboardPage,
} from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { getAppShellContext } from "@/lib/app-shell/context";
import {
  getBusinessDiscussionsPath,
} from "@/features/businesses/routes";
import { BusinessDiscussionList } from "@/features/quote-discussions/components/business-discussion-list";
import { DiscussionAutoRefresh } from "@/features/quote-discussions/components/discussion-auto-refresh";
import { getQuoteDiscussionInboxForBusiness } from "@/features/quote-discussions/queries";
import { quoteDiscussionInboxFiltersSchema } from "@/features/quote-discussions/schemas";
import type { QuoteDiscussionView } from "@/features/quote-discussions/types";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Discussions",
  description: "Reply to customer questions about your quotes.",
});

export const instant = true;

type DiscussionsPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const viewLabels: Record<QuoteDiscussionView, string> = {
  needs_reply: "Needs reply",
  waiting_for_customer: "Waiting for customer",
  archived: "Archived",
};

export default function DiscussionsPage({
  params,
  searchParams,
}: DiscussionsPageProps) {
  return (
    <DashboardPage>
      <DiscussionAutoRefresh />
      <PageHeader title="Discussions" />

      <Suspense fallback={<DiscussionsPageSkeleton />}>
        <DiscussionsRegion params={params} searchParams={searchParams} />
      </Suspense>
    </DashboardPage>
  );
}

async function DiscussionsRegion({ params, searchParams }: DiscussionsPageProps) {
  const [{ businessSlug }, resolvedSearchParams, user] = await Promise.all([
    params,
    searchParams,
    requireUser(),
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);
  const parsedFilters = quoteDiscussionInboxFiltersSchema.safeParse(
    resolvedSearchParams,
  );
  const filters = parsedFilters.success
    ? parsedFilters.data
    : { view: "needs_reply" as const, page: 1 };

  const inbox = await getQuoteDiscussionInboxForBusiness({
    businessId: businessContext.business.id,
    userId: user.id,
    filters,
  });
  const totalPages = Math.max(1, Math.ceil(inbox.totalCount / inbox.pageSize));
  const buildViewHref = (view: QuoteDiscussionView) =>
    `${getBusinessDiscussionsPath(businessSlug)}?view=${view}`;

  return (
    <>
      <nav
        aria-label="Discussion views"
        className="flex flex-wrap items-center gap-2"
      >
        {(Object.keys(viewLabels) as QuoteDiscussionView[]).map((view) => {
          const isActive = filters.view === view;

          return (
            <Button
              asChild
              key={view}
              size="sm"
              variant={isActive ? "default" : "outline"}
            >
              <Link
                aria-current={isActive ? "page" : undefined}
                href={buildViewHref(view)}
              >
                {viewLabels[view]}
              </Link>
            </Button>
          );
        })}
      </nav>

      <div className="dashboard-table-shell" data-list-card>
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
          <p className="text-sm text-muted-foreground">
            {inbox.totalCount}{" "}
            {inbox.totalCount === 1 ? "conversation" : "conversations"}
          </p>
          <p className="text-xs text-muted-foreground">
            Page {filters.page} of {totalPages}
          </p>
        </div>

        <BusinessDiscussionList
          businessSlug={businessSlug}
          items={inbox.items}
          view={filters.view}
        />

        {totalPages > 1 ? (
          <nav
            aria-label="Discussion pages"
            className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3 sm:px-5"
          >
            <Button
              asChild
              disabled={filters.page <= 1}
              size="sm"
              variant="outline"
            >
              <Link
                aria-disabled={filters.page <= 1}
                href={`${getBusinessDiscussionsPath(businessSlug)}?view=${filters.view}&page=${Math.max(1, filters.page - 1)}`}
              >
                Previous
              </Link>
            </Button>
            <Button
              asChild
              disabled={filters.page >= totalPages}
              size="sm"
              variant="outline"
            >
              <Link
                aria-disabled={filters.page >= totalPages}
                href={`${getBusinessDiscussionsPath(businessSlug)}?view=${filters.view}&page=${Math.min(totalPages, filters.page + 1)}`}
              >
                Next
              </Link>
            </Button>
          </nav>
        ) : null}
      </div>
    </>
  );
}

export function DiscussionsPageSkeleton() {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-8 w-32 rounded-lg" key={index} />
        ))}
      </div>
      <div className="dashboard-table-shell" data-list-card>
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="flex flex-col gap-2" key={index}>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
