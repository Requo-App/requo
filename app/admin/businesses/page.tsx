import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  AdminBusinessesListContentSection,
  AdminBusinessesListControlsSection,
} from "@/features/admin/components/admin-businesses-list-sections";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Businesses - Requo admin",
  description: "Read-only review of customer business setups.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminBusinessesPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin businesses list — non-blocking structural shell.
 *
 * Returns the `DashboardPage` shell and `PageHeader` synchronously so the
 * header paints instantly on sibling navigations. All dynamic reads
 * (`searchParams`, the admin gate + view log, queries) resolve inside the
 * Suspense-wrapped regions below. The view audit row is written once, from
 * the content region.
 */
export default function AdminBusinessesPage({
  searchParams,
}: AdminBusinessesPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Businesses"
        description="Read-only review of customer business setups."
      />
      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<AdminListControlsFallback />}>
          <AdminBusinessesControlsRegion searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AdminListContentFallback />}>
          <AdminBusinessesContentRegion searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

async function AdminBusinessesControlsRegion({
  searchParams,
}: AdminBusinessesPageProps) {
  const rawParams = await searchParams;

  return <AdminBusinessesListControlsSection rawParams={rawParams} />;
}

async function AdminBusinessesContentRegion({
  searchParams,
}: AdminBusinessesPageProps) {
  const rawParams = await searchParams;

  return withAdminViewLog(
    { action: "view.businesses", targetType: "business" },
    () => <AdminBusinessesListContentSection rawParams={rawParams} />,
  );
}
