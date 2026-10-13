import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { LockedFeaturePage } from "@/components/shared/paywall";
import { ProductsPageSkeleton } from "@/components/shell/products-page-skeleton";
import { getBusinessBillingOverview } from "@/features/billing/queries";
import {
  analyzeImportAction,
  commitProductImportAction,
} from "@/features/importer/actions";
import {
  createQuoteLibraryEntryAction,
  deleteQuoteLibraryEntryAction,
  updateQuoteLibraryEntryAction,
} from "@/features/quotes/quote-library-actions";
import { getQuoteLibraryForBusiness } from "@/features/quotes/quote-library-queries";
import { BusinessProductLibraryManager } from "@/features/settings/components/business-product-library-manager";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";
import { hasFeatureAccess } from "@/lib/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOperationalPageContext } from "../../settings/_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Products",
  description: "Manage the product library used to build quotes quickly.",
});

export const instant = true;

/**
 * Products page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, getBusinessOperationalPageContext, queries) are
 * pushed into a Suspense-wrapped child server component so the static shell
 * is prefetchable and sibling navigations paint instantly.
 */
export default function BusinessProductsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <DashboardPage>
      <PageHeader title="Products" />
      <Suspense fallback={<ProductsPageSkeleton />}>
        <ProductsRegion params={params} />
      </Suspense>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Suspense-wrapped async child server component
// ---------------------------------------------------------------------------

async function ProductsRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { businessContext } = await getBusinessOperationalPageContext(businessSlug);
  const hasAccess = hasFeatureAccess(
    businessContext.business.plan,
    "quoteLibrary",
  );

  if (!hasAccess) {
    const billingOverview = await getBusinessBillingOverview(
      businessContext.business.id,
    );

    return (
      <LockedFeaturePage
        feature="quoteLibrary"
        plan={businessContext.business.plan}
        description="Upgrade to build reusable product blocks and speed up quote creation."
        upgradeAction={
          billingOverview
            ? {
                userId: billingOverview.userId,
                businessId: billingOverview.businessId,
                businessSlug: billingOverview.businessSlug,
                currentPlan: billingOverview.currentPlan,
                ctaLabel: "Upgrade for product library",
              }
            : undefined
        }
      />
    );
  }

  const [settings, quoteLibrary] = await Promise.all([
    getBusinessSettingsForBusiness(businessContext.business.id),
    getQuoteLibraryForBusiness(businessContext.business.id),
  ]);

  if (!settings) {
    notFound();
  }

  // Filter out templates — they have their own dedicated page
  const productEntries = quoteLibrary.filter(
    (entry) => entry.kind !== "template",
  );

  return (
    <BusinessProductLibraryManager
      createAction={createQuoteLibraryEntryAction}
      deleteAction={deleteQuoteLibraryEntryAction}
      productLimit={getUsageLimit(businessContext.business.plan, "productEntriesPerBusiness")}
      quoteLibrary={productEntries}
      updateAction={updateQuoteLibraryEntryAction}
      importerEnabled={hasFeatureAccess(businessContext.business.plan, "aiQuoteDrafting")}
      analyzeImportAction={analyzeImportAction}
      commitProductImportAction={commitProductImportAction}
    />
  );
}
