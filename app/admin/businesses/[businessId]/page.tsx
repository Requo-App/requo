import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  DashboardDetailLayout,
  DashboardPage,
  DashboardSidebarStack,
} from "@/components/shared/dashboard-layout";
import {
  AdminDetailHeaderFallback,
  AdminDetailSectionFallback,
} from "@/features/admin/components/admin-detail-section-fallback";
import {
  AdminBusinessHeaderSection,
  AdminBusinessMembersSection,
  AdminBusinessMetaSidebar,
  AdminBusinessOverviewSection,
} from "@/features/admin/components/admin-business-detail";
import { AdminBusinessBillingSection } from "@/features/admin/components/billing/admin-business-billing-section";
import { withAdminViewLog } from "@/features/admin/page-shell";
import {
  getAdminBusinessBilling,
  getAdminBusinessDetailCore,
  getAdminBusinessMembers,
} from "@/features/admin/queries";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Business - Requo admin",
  description: "Read-only details for a customer business.",
});

type AdminBusinessDetailPageProps = {
  params: Promise<{ businessId: string }>;
};

/**
 * Admin business detail (task 12.3 / Req 5.3, 5.4) — staged shell.
 *
 * Identity + lifecycle status in the header with the action toolbar
 * (change plan, cancel subscription, archive / restore / delete — each
 * behind a modal), pipeline overview, member roster, and the business
 * subscription in the main column, owner + record metadata in the
 * sidebar. Subscription writes are business-scoped through the
 * subscription service; the legacy `account_subscriptions` table is
 * not read or written here.
 *
 * The page returns its layout frames synchronously; the core row plus
 * scalar aggregates paint the header, overview, and sidebar metadata
 * first, and the member roster and billing panel each stream behind
 * their own boundary. Records a `view.business` audit entry with
 * `targetId = businessId` (Req 10.1) via `withAdminViewLog`.
 */
export default function AdminBusinessDetailPage({
  params,
}: AdminBusinessDetailPageProps) {
  return (
    <DashboardPage>
      <Suspense fallback={<AdminDetailHeaderFallback />}>
        <AdminBusinessHeaderRegion params={params} />
      </Suspense>

      <DashboardDetailLayout className="xl:grid-cols-[minmax(0,1.1fr)_0.9fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Suspense fallback={<AdminDetailSectionFallback />}>
            <AdminBusinessOverviewRegion params={params} />
          </Suspense>
          <Suspense fallback={<AdminDetailSectionFallback />}>
            <AdminBusinessMembersRegion params={params} />
          </Suspense>
          <Suspense fallback={<AdminDetailSectionFallback rows={4} />}>
            <AdminBusinessBillingRegion params={params} />
          </Suspense>
        </div>

        <DashboardSidebarStack>
          <Suspense fallback={<AdminDetailSectionFallback rows={2} />}>
            <AdminBusinessMetaSidebarRegion params={params} />
          </Suspense>
        </DashboardSidebarStack>
      </DashboardDetailLayout>
    </DashboardPage>
  );
}

async function AdminBusinessHeaderRegion({
  params,
}: AdminBusinessDetailPageProps) {
  const { businessId } = await params;

  return withAdminViewLog(
    {
      action: "view.business",
      targetType: "business",
      targetId: businessId,
    },
    async () => {
      // The toolbar's plan actions read the subscription, so the header
      // resolves billing alongside the core row. Self-hosted installations
      // have no Requo Cloud subscriptions or plan controls.
      const { isSelfHostedDeployment } = await import("@/lib/deployment");
      const [core, billing] = await Promise.all([
        getAdminBusinessDetailCore(businessId),
        isSelfHostedDeployment()
          ? Promise.resolve(null)
          : getAdminBusinessBilling(businessId),
      ]);

      if (!core) {
        notFound();
      }

      return <AdminBusinessHeaderSection billing={billing} detail={core} />;
    },
  );
}

async function AdminBusinessOverviewRegion({
  params,
}: AdminBusinessDetailPageProps) {
  const { businessId } = await params;
  const core = await getAdminBusinessDetailCore(businessId);

  if (!core) {
    notFound();
  }

  return <AdminBusinessOverviewSection detail={core} />;
}

async function AdminBusinessMembersRegion({
  params,
}: AdminBusinessDetailPageProps) {
  const { businessId } = await params;
  const [core, members] = await Promise.all([
    getAdminBusinessDetailCore(businessId),
    getAdminBusinessMembers(businessId),
  ]);

  if (!core) {
    notFound();
  }

  return (
    <AdminBusinessMembersSection
      memberCount={core.memberCount}
      members={members}
    />
  );
}

async function AdminBusinessBillingRegion({
  params,
}: AdminBusinessDetailPageProps) {
  const { businessId } = await params;
  const { isSelfHostedDeployment } = await import("@/lib/deployment");

  if (isSelfHostedDeployment()) {
    return null;
  }

  const billing = await getAdminBusinessBilling(businessId);

  // A billing hiccup must not take down the identity view, so the
  // section is skipped rather than errored.
  return billing ? <AdminBusinessBillingSection billing={billing} /> : null;
}

async function AdminBusinessMetaSidebarRegion({
  params,
}: AdminBusinessDetailPageProps) {
  const { businessId } = await params;
  const core = await getAdminBusinessDetailCore(businessId);

  if (!core) {
    notFound();
  }

  return <AdminBusinessMetaSidebar detail={core} />;
}
