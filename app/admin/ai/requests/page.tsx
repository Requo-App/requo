import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import {
  AdminAiRequestsListContentSection,
  AdminAiRequestsListControlsSection,
} from "@/features/admin/components/ai/admin-ai-requests-list-sections";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "AI requests - Requo admin",
  description: "Per-call provider, model, latency, and tokens.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminAiRequestsPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin AI requests list — non-blocking structural shell.
 *
 * Returns the `DashboardPage` shell and `PageHeader` synchronously so the
 * header paints instantly on sibling navigations. All dynamic reads
 * (`searchParams`, the admin gate + view log, queries) resolve inside the
 * Suspense-wrapped regions below. The view audit row is written once, from
 * the content region.
 */
export default function AdminAiRequestsPage({
  searchParams,
}: AdminAiRequestsPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        description="Per-call provider, model, latency, and tokens."
        title="AI requests"
      />
      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<AdminListControlsFallback />}>
          <AdminAiRequestsControlsRegion searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AdminListContentFallback />}>
          <AdminAiRequestsContentRegion searchParams={searchParams} />
        </Suspense>
      </div>
    </DashboardPage>
  );
}

async function AdminAiRequestsControlsRegion({
  searchParams,
}: AdminAiRequestsPageProps) {
  const rawParams = await searchParams;

  return <AdminAiRequestsListControlsSection rawParams={rawParams} />;
}

async function AdminAiRequestsContentRegion({
  searchParams,
}: AdminAiRequestsPageProps) {
  const rawParams = await searchParams;

  return withAdminViewLog(
    { action: "view.ai-requests", targetType: "ai-request" },
    () => <AdminAiRequestsListContentSection rawParams={rawParams} />,
  );
}
