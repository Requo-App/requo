import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { ServicesPageSkeleton } from "@/components/shell/services-page-skeleton";
import {
  createServiceAction,
  unarchiveServiceAction,
} from "@/features/settings/actions";
import { ServicesList } from "@/features/settings/components/services-list";
import { getServicesSettingsForBusiness } from "@/features/settings/queries";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOperationalPageContext } from "../../settings/_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Services",
  description: "Manage services for this business.",
});

export const instant = true;

/**
 * Services page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, getBusinessOperationalPageContext, queries) are
 * pushed into a Suspense-wrapped child server component so the static shell
 * is prefetchable and sibling navigations paint instantly.
 */
export default function BusinessServicesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <DashboardPage>
      <PageHeader title="Services" />
      <Suspense fallback={<ServicesPageSkeleton />}>
        <ServicesRegion params={params} />
      </Suspense>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Suspense-wrapped async child server component
// ---------------------------------------------------------------------------

async function ServicesRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { businessContext } = await getBusinessOperationalPageContext(businessSlug);
  const settings = await getServicesSettingsForBusiness(
    businessContext.business.id,
  );

  if (!settings) {
    notFound();
  }

  return (
    <ServicesList
      createAction={createServiceAction}
      unarchiveAction={unarchiveServiceAction}
      settings={settings}
      plan={businessContext.business.plan}
    />
  );
}
