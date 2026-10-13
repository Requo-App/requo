import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import {
  AdminInvoicesListContentSection,
  AdminInvoicesListControlsSection,
} from "@/features/admin/components/product/invoices/admin-invoices-list-sections";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Invoices - Requo admin",
  description: "Manual-payment invoices across every business.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminInvoicesPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin invoices list — non-blocking structural shell.
 *
 * Returns the `DashboardPage` shell and `PageHeader` synchronously so the
 * header paints instantly on sibling navigations. All dynamic reads
 * (`searchParams`, the admin gate + view log, queries) resolve inside the
 * Suspense-wrapped regions below. The view audit row is written once, from
 * the content region.
 */
export default function AdminInvoicesPage({
  searchParams,
}: AdminInvoicesPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="Invoices"
        description="Manual-payment invoices across every business."
      />
      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<AdminListControlsFallback />}>
          <AdminInvoicesControlsRegion searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AdminListContentFallback />}>
          <AdminInvoicesContentRegion searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

async function AdminInvoicesControlsRegion({
  searchParams,
}: AdminInvoicesPageProps) {
  const rawParams = await searchParams;

  return <AdminInvoicesListControlsSection rawParams={rawParams} />;
}

async function AdminInvoicesContentRegion({
  searchParams,
}: AdminInvoicesPageProps) {
  const rawParams = await searchParams;

  return withAdminViewLog(
    { action: "view.invoices", targetType: "invoice" },
    () => <AdminInvoicesListContentSection rawParams={rawParams} />,
  );
}
