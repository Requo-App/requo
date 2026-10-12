import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import {
  AdminAiErrorsTableSection,
  AdminAiErrorsControlsSection,
  AdminAiSecurityEventsFallback,
  AdminAiSecurityEventsSection,
} from "@/features/admin/components/ai/admin-ai-errors-sections";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "AI errors - Requo admin",
  description: "Failed AI calls and security events.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminAiErrorsPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin AI errors — non-blocking structural shell.
 *
 * Returns the `DashboardPage` shell and `PageHeader` synchronously so the
 * header paints instantly on sibling navigations. All dynamic reads
 * (`searchParams`, the admin gate + view log, queries) resolve inside the
 * Suspense-wrapped regions below. The view audit row is written once, from
 * the content region.
 */
export default function AdminAiErrorsPage({
  searchParams,
}: AdminAiErrorsPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        description="Failed AI calls and security events."
        title="AI errors"
      />
      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<AdminListControlsFallback />}>
          <AdminAiErrorsControlsRegion searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AdminListContentFallback />}>
          <AdminAiErrorsContentRegion searchParams={searchParams} />
        </Suspense>
      </div>
      <Suspense fallback={<AdminAiSecurityEventsFallback />}>
        <AdminAiSecurityEventsRegion searchParams={searchParams} />
      </Suspense>
    </DashboardPage>
  );
}

async function AdminAiErrorsControlsRegion({
  searchParams,
}: AdminAiErrorsPageProps) {
  const rawParams = await searchParams;

  return <AdminAiErrorsControlsSection rawParams={rawParams} />;
}

async function AdminAiErrorsContentRegion({
  searchParams,
}: AdminAiErrorsPageProps) {
  const rawParams = await searchParams;

  return withAdminViewLog(
    { action: "view.ai-errors", targetType: "ai-request" },
    () => <AdminAiErrorsTableSection rawParams={rawParams} />,
  );
}

async function AdminAiSecurityEventsRegion({
  searchParams,
}: AdminAiErrorsPageProps) {
  const rawParams = await searchParams;

  return <AdminAiSecurityEventsSection rawParams={rawParams} />;
}
