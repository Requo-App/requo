import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AdminAuditListContentSection,
  AdminAuditListControlsSection,
  AdminAuditListPageShell,
} from "@/features/admin/components/system/admin-audit-list-sections";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Audit logs - Requo admin",
  description: "Every admin view and action, newest first.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AuditLogsPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin audit logs — non-blocking structural shell.
 *
 * `AdminAuditListPageShell` is pure static JSX, so it returns
 * synchronously and the header paints instantly on sibling navigations.
 * All dynamic reads (`searchParams`, the admin gate + view log, queries)
 * resolve inside the Suspense-wrapped regions below. The view audit row
 * is written once, from the content region.
 */
export default function AuditLogsPage({ searchParams }: AuditLogsPageProps) {
  return (
    <AdminAuditListPageShell>
      <div className="dashboard-table-shell" data-list-card>
        <Suspense fallback={<AdminListControlsFallback />}>
          <AuditLogsControlsRegion searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={<AdminListContentFallback />}>
          <AuditLogsContentRegion searchParams={searchParams} />
        </Suspense>
      </div>
    </AdminAuditListPageShell>
  );
}

async function AuditLogsControlsRegion({ searchParams }: AuditLogsPageProps) {
  const rawParams = await searchParams;

  return <AdminAuditListControlsSection rawParams={rawParams} />;
}

async function AuditLogsContentRegion({ searchParams }: AuditLogsPageProps) {
  const rawParams = await searchParams;

  return withAdminViewLog(
    { action: "view.audit-logs", targetType: "audit-log" },
    () => <AdminAuditListContentSection rawParams={rawParams} />,
  );
}
