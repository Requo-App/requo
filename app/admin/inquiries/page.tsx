import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import {
  AdminInquiriesListContentSection,
  AdminInquiriesListControlsSection,
} from "@/features/admin/components/product/inquiries/admin-inquiries-list-sections";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Inquiries - Requo admin",
  description: "Inbound customer requests across every business.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminInquiriesPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin inquiries list — non-blocking structural shell.
 *
 * Returns the `DashboardPage` shell and `PageHeader` synchronously so the
 * header paints instantly on sibling navigations. All dynamic reads
 * (`searchParams`, the admin gate + view log, queries) resolve inside the
 * Suspense-wrapped regions below. The view audit row is written once, from
 * the content region.
 */
export default function AdminInquiriesPage({
  searchParams,
}: AdminInquiriesPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Inquiries"
        description="Inbound customer requests across every business."
      />
      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<AdminListControlsFallback />}>
          <AdminInquiriesControlsRegion searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AdminListContentFallback />}>
          <AdminInquiriesContentRegion searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

async function AdminInquiriesControlsRegion({
  searchParams,
}: AdminInquiriesPageProps) {
  const rawParams = await searchParams;

  return <AdminInquiriesListControlsSection rawParams={rawParams} />;
}

async function AdminInquiriesContentRegion({
  searchParams,
}: AdminInquiriesPageProps) {
  const rawParams = await searchParams;

  return withAdminViewLog(
    { action: "view.inquiries", targetType: "inquiry" },
    () => <AdminInquiriesListContentSection rawParams={rawParams} />,
  );
}
