import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import {
  AdminUsersListContentSection,
  AdminUsersListControlsSection,
} from "@/features/admin/components/admin-users-list-sections";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Users - Requo admin",
  description: "Search, inspect, and support Requo users.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminUsersPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin users list — non-blocking structural shell.
 *
 * Returns the `DashboardPage` shell and `PageHeader` synchronously so the
 * header paints instantly on sibling navigations. All dynamic reads
 * (`searchParams`, the admin gate + view log, queries) resolve inside the
 * Suspense-wrapped regions below. The view audit row is written once, from
 * the content region.
 */
export default function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Users"
        description="Search, inspect, and support Requo users."
      />
      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<AdminListControlsFallback />}>
          <AdminUsersControlsRegion searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AdminListContentFallback />}>
          <AdminUsersContentRegion searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

async function AdminUsersControlsRegion({
  searchParams,
}: AdminUsersPageProps) {
  const rawParams = await searchParams;

  return <AdminUsersListControlsSection rawParams={rawParams} />;
}

async function AdminUsersContentRegion({
  searchParams,
}: AdminUsersPageProps) {
  const rawParams = await searchParams;

  return withAdminViewLog(
    { action: "view.users", targetType: "user" },
    () => <AdminUsersListContentSection rawParams={rawParams} />,
  );
}
