import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { BusinessAuditLogFilters } from "@/features/audit/components/business-audit-log-filters";
import {
  AuditLogFiltersFallback,
  AuditLogTableFallback,
} from "@/features/audit/components/business-audit-log-fallbacks";
import { BusinessAuditLogTable } from "@/features/audit/components/business-audit-log-table";
import {
  getBusinessAuditLogFiltersBySlug,
  getBusinessAuditLogPageBySlug,
  parseAuditLogFilters,
} from "@/features/audit/queries";
import { getBusinessSettingsPath } from "@/features/businesses/routes";
import { FeatureGate } from "@/features/entitlements";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import { getBusinessOperationalPageContext } from "../_lib/page-context";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Audit log",
  description: "Review meaningful admin, lifecycle, and security actions.",
});

export const instant = true;

type AuditLogSettingsPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Audit log settings page — non-blocking structural shell.
 *
 * Matches (main) list pages (e.g. inquiries): the static container paints
 * instantly, filters and table stream in behind their own component
 * skeletons — no full-page skeleton. Same fallbacks as loading.tsx so hard
 * load and client navigation show identical progressive regions.
 *
 * Single-flight data: params + page context resolve once in AuditLogShell;
 * the two list queries start in parallel and each streams behind its own
 * Suspense boundary so filters never wait for table data (or vice versa).
 */
export default function AuditLogSettingsPage({
  params,
  searchParams,
}: AuditLogSettingsPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense
        fallback={
          <>
            <AuditLogFiltersFallback />
            <AuditLogTableFallback />
          </>
        }
      >
        <AuditLogShell params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AuditLogShell({
  params,
  searchParams,
}: AuditLogSettingsPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { user, businessContext } =
    await getBusinessOperationalPageContext(businessSlug);
  const { business } = businessContext;

  // Gate before starting any audit queries. Audit logs are a Business-plan
  // entitlement, so Free and Pro requests must not read audit rows at all.
  if (!hasFeatureAccess(business.plan, "auditLogs")) {
    return (
      <FeatureGate
        feature="auditLogs"
        plan={business.plan}
        variant="page"
        upgradeAction={{
          userId: user.id,
          businessId: business.id,
          businessSlug: business.slug,
          currentPlan: business.plan,
        }}
      >
        <></>
      </FeatureGate>
    );
  }

  const filters = parseAuditLogFilters(resolvedSearchParams);

  // Start both queries in parallel; each streams behind its own boundary.
  const filterOptionsPromise = getBusinessAuditLogFiltersBySlug(
    user.id,
    businessSlug,
  );
  const pagePromise = getBusinessAuditLogPageBySlug(
    user.id,
    businessSlug,
    filters,
  );

  const actionPath = getBusinessSettingsPath(businessSlug, "audit-log");

  return (
    <>
      <Suspense fallback={<AuditLogFiltersFallback />}>
        <AuditLogFiltersContent
          actionPath={actionPath}
          filterOptionsPromise={filterOptionsPromise}
          filters={filters}
        />
      </Suspense>

      <Suspense fallback={<AuditLogTableFallback />}>
        <AuditLogTableContent pagePromise={pagePromise} />
      </Suspense>
    </>
  );
}

async function AuditLogFiltersContent({
  actionPath,
  filterOptionsPromise,
  filters,
}: {
  actionPath: string;
  filterOptionsPromise: ReturnType<typeof getBusinessAuditLogFiltersBySlug>;
  filters: ReturnType<typeof parseAuditLogFilters>;
}) {
  const filterOptions = await filterOptionsPromise;

  if (!filterOptions) {
    notFound();
  }

  return (
    <div className="dashboard-table-shell mx-auto w-full max-w-2xl" data-list-card>
      <BusinessAuditLogFilters
        action={actionPath}
        filters={filters}
        options={filterOptions}
      />
    </div>
  );
}

async function AuditLogTableContent({
  pagePromise,
}: {
  pagePromise: ReturnType<typeof getBusinessAuditLogPageBySlug>;
}) {
  const page = await pagePromise;

  if (!page) {
    notFound();
  }

  return (
    <div className="dashboard-table-shell" data-list-card>
      <BusinessAuditLogTable page={page} />
    </div>
  );
}
