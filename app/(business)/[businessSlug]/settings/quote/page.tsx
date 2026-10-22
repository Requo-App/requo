import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FeatureGate } from "@/features/entitlements";
import {
  BusinessQuoteDefaultsStaticFallback,
  SettingsCollectionBodySkeleton,
} from "@/components/shell/settings-body-skeletons";
import { getBusinessBillingOverview } from "@/features/billing/queries";
import type { QuoteLibraryBlockReference } from "@/features/quotes/components/quote-library-entry-form";
import {
  createQuoteLibraryEntryAction,
  deleteQuoteLibraryEntryAction,
  updateQuoteLibraryEntryAction,
} from "@/features/quotes/quote-library-actions";
import { getQuoteLibraryForBusiness } from "@/features/quotes/quote-library-queries";
import { updateBusinessQuoteSettingsAction } from "@/features/settings/actions";
import { BusinessQuoteSettingsForm } from "@/features/settings/components/business-quote-settings-form";
import { QuoteSettingsTabs } from "@/features/settings/components/quote-settings-tabs";
import { QuoteTemplatesManager } from "@/features/settings/components/quote-templates-manager";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";
import { hasFeatureAccess } from "@/lib/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOperationalPageContext } from "../_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Quotes",
  description: "Business quote defaults and reusable quote templates.",
});

export const instant = true;

/**
 * Quote settings page — tabbed, non-blocking structural shell.
 *
 * Matches the general settings page (no visible page header) and splits the
 * surface into two tabs: Quote defaults (selected) and Templates. Templates
 * used to live at /settings/quote-templates. The tab bar paints instantly;
 * each tab body is an async server component inside its own Suspense
 * boundary. The defaults tab shows real static copy with skeletons only on
 * DB-backed controls.
 */
export default function BusinessQuoteSettingsPage() {
  return (
    <QuoteSettingsTabs
      quote={
        <Suspense fallback={<BusinessQuoteDefaultsStaticFallback />}>
          <QuoteDefaultsTab />
        </Suspense>
      }
      templates={
        <Suspense fallback={<SettingsCollectionBodySkeleton />}>
          <QuoteTemplatesTab />
        </Suspense>
      }
    />
  );
}

async function QuoteDefaultsTab() {
  const { businessContext } = await getBusinessOperationalPageContext();
  const businessId = businessContext.business.id;

  const settings = await getBusinessSettingsForBusiness(businessId);

  if (!settings) {
    notFound();
  }

  return (
    <BusinessQuoteSettingsForm
      action={updateBusinessQuoteSettingsAction}
      key={`business-quote-settings-${settings.updatedAt.getTime()}`}
      settings={settings}
    />
  );
}

async function QuoteTemplatesTab() {
  const { businessContext } = await getBusinessOperationalPageContext();
  const businessId = businessContext.business.id;
  const businessPlan = businessContext.business.plan;

  const hasLibraryAccess = hasFeatureAccess(businessPlan, "quoteLibrary");

  if (hasLibraryAccess) {
    const [quoteLibrary, settings] = await Promise.all([
      getQuoteLibraryForBusiness(businessId),
      getBusinessSettingsForBusiness(businessId),
    ]);
    const templates = quoteLibrary.filter((entry) => entry.kind === "template");
    const availableBlocks: QuoteLibraryBlockReference[] = quoteLibrary
      .filter((entry) => entry.kind !== "template")
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        currency: entry.currency,
        totalInCents: entry.totalInCents,
        items: entry.items,
      }));

    return (
      <QuoteTemplatesManager
        availableBlocks={availableBlocks}
        businessDefaults={
          settings
            ? {
                defaultQuoteNotes: settings.defaultQuoteNotes,
                defaultQuoteTerms: settings.defaultQuoteTerms,
                defaultQuoteValidityDays: settings.defaultQuoteValidityDays,
              }
            : undefined
        }
        createAction={createQuoteLibraryEntryAction}
        deleteAction={deleteQuoteLibraryEntryAction}
        pricingLimit={getUsageLimit(businessPlan, "quoteLibraryEntriesPerBusiness")}
        templates={templates}
        totalLibraryCount={quoteLibrary.length}
        updateAction={updateQuoteLibraryEntryAction}
      />
    );
  }

  const billingOverview = await getBusinessBillingOverview(businessId).catch(
    () => null,
  );

  return (
    <FeatureGate
      variant="page"
      feature="quoteLibrary"
      plan={businessPlan}
      description="Upgrade to create reusable quote templates and speed up quoting."
      upgradeAction={
        billingOverview
          ? {
              userId: billingOverview.userId,
              businessId: billingOverview.businessId,
              businessSlug: billingOverview.businessSlug,
              currentPlan: billingOverview.currentPlan,
              ctaLabel: "Upgrade for quote templates",
            }
          : undefined
      }
    >
      {null}
    </FeatureGate>
  );
}
