import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import {
  AdminQuotesListContentSection,
  AdminQuotesListControlsSection,
} from "@/features/admin/components/product/quotes/admin-quotes-list-sections";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Quotes - Requo admin",
  description: "Quote drafts, deliveries, and customer responses.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminQuotesPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin quotes list — non-blocking structural shell.
 *
 * Returns the `DashboardPage` shell and `PageHeader` synchronously so the
 * header paints instantly on sibling navigations. All dynamic reads
 * (`searchParams`, the admin gate + view log, queries) resolve inside the
 * Suspense-wrapped regions below. The view audit row is written once, from
 * the content region.
 */
export default function AdminQuotesPage({
  searchParams,
}: AdminQuotesPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Quotes"
        description="Quote drafts, deliveries, and customer responses."
      />
      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<AdminListControlsFallback />}>
          <AdminQuotesControlsRegion searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AdminListContentFallback />}>
          <AdminQuotesContentRegion searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

async function AdminQuotesControlsRegion({
  searchParams,
}: AdminQuotesPageProps) {
  const rawParams = await searchParams;

  return <AdminQuotesListControlsSection rawParams={rawParams} />;
}

async function AdminQuotesContentRegion({
  searchParams,
}: AdminQuotesPageProps) {
  const rawParams = await searchParams;

  return withAdminViewLog(
    { action: "view.quotes", targetType: "quote" },
    () => <AdminQuotesListContentSection rawParams={rawParams} />,
  );
}
