import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { FeatureGate } from "@/features/entitlements";
import { QuoteLibraryPageSkeleton } from "@/components/shell/quote-library-page-skeleton";
import { getBusinessBillingOverview } from "@/features/billing/queries";
import {
  analyzeImportAction,
  commitQuoteLibraryImportAction,
} from "@/features/importer/actions";
import {
  createQuoteLibraryEntryAction,
  deleteQuoteLibraryEntryAction,
  updateQuoteLibraryEntryAction,
} from "@/features/quotes/quote-library-actions";
import { getQuoteLibraryForBusiness } from "@/features/quotes/quote-library-queries";
import { QuoteLibraryManager } from "@/features/settings/components/quote-library-manager";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";
import { hasFeatureAccess } from "@/lib/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOperationalPageContext } from "../../settings/_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Quote library",
  description: "Manage reusable quote library entries to build quotes faster.",
});

export const instant = true;

/**
 * Quote library page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, getBusinessOperationalPageContext, queries) are
 * pushed into a Suspense-wrapped child server component so the static shell
 * is prefetchable and sibling navigations paint instantly.
 */
export default function QuoteLibraryPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <DashboardPage>
      <PageHeader title="Quote library" />
      <Suspense fallback={<QuoteLibraryPageSkeleton />}>
        <QuoteLibraryRegion params={params} />
      </Suspense>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Suspense-wrapped async child server component
// ---------------------------------------------------------------------------

async function QuoteLibraryRegion({
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
      <FeatureGate
        variant="page"
        feature="quoteLibrary"
        plan={businessContext.business.plan}
        description="Upgrade to build reusable quote library entries and speed up quote creation."
        upgradeAction={
          billingOverview
            ? {
                userId: billingOverview.userId,
                businessId: billingOverview.businessId,
                businessSlug: billingOverview.businessSlug,
                currentPlan: billingOverview.currentPlan,
                ctaLabel: "Upgrade for quote library",
              }
            : undefined
        }
      >
        {null}
      </FeatureGate>
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
  const quoteLibraryEntries = quoteLibrary.filter(
    (entry) => entry.kind !== "template",
  );

  return (
    <QuoteLibraryManager
      createAction={createQuoteLibraryEntryAction}
      deleteAction={deleteQuoteLibraryEntryAction}
      quoteLibraryLimit={getUsageLimit(businessContext.business.plan, "quoteLibraryEntriesPerBusiness")}
      quoteLibrary={quoteLibraryEntries}
      updateAction={updateQuoteLibraryEntryAction}
      importerEnabled={hasFeatureAccess(businessContext.business.plan, "aiQuoteDrafting")}
      analyzeImportAction={analyzeImportAction}
      commitQuoteLibraryImportAction={commitQuoteLibraryImportAction}
    />
  );
}
