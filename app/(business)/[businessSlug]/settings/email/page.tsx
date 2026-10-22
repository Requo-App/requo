import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FeatureGate } from "@/features/entitlements";
import { BusinessEmailTemplateStaticFallback } from "@/components/shell/settings-body-skeletons";
import { getBusinessBillingOverview } from "@/features/billing/queries";
import { updateBusinessEmailTemplateSettingsAction } from "@/features/settings/actions";
import { BusinessEmailTemplateForm } from "@/features/settings/components/business-email-template-form";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";
import {
  EMAIL_TEMPLATE_KIND_DESCRIPTIONS,
  EMAIL_TEMPLATE_KIND_LABELS,
  quoteEmailMergeTags,
} from "@/features/settings/email-templates";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOperationalPageContext } from "../_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Email templates",
  description: "Edit the email templates Requo sends on behalf of this business.",
});

export const instant = true;

/**
 * Email template settings page — non-blocking structural shell.
 *
 * Static template copy (kind title/description, subject label, merge-tag
 * labels, canvas headings) paints instantly like (main) PageHeader titles;
 * only the DB-backed subject input, canvas blocks, and inspector stream
 * behind skeletons. Assumes the default Quote tab until the client form
 * hydrates and syncs the hash. All dynamic reads are resolved inside a
 * Suspense-wrapped child server component.
 */
export default function BusinessEmailTemplateSettingsPage() {
  return (
    <Suspense
      fallback={
        <BusinessEmailTemplateStaticFallback
          kindDescription={EMAIL_TEMPLATE_KIND_DESCRIPTIONS.quote}
          kindLabel={EMAIL_TEMPLATE_KIND_LABELS.quote}
          mergeTags={quoteEmailMergeTags}
        />
      }
    >
      <BusinessEmailTemplateSettingsContent />
    </Suspense>
  );
}

async function BusinessEmailTemplateSettingsContent() {
  const { user, businessContext } = await getBusinessOperationalPageContext();

  const billingOverview = await getBusinessBillingOverview(
    businessContext.business.id,
  ).catch(() => null);

  const settings = await getBusinessSettingsForBusiness(
    businessContext.business.id,
  );

  if (!settings) {
    notFound();
  }

  return (
    <FeatureGate
      feature="emailTemplates"
      plan={businessContext.business.plan}
      variant="page"
      upgradeAction={
        billingOverview
          ? {
              userId: user.id,
              businessId: businessContext.business.id,
              businessSlug: businessContext.business.slug,
              currentPlan: billingOverview.currentPlan,
            }
          : undefined
      }
    >
      <BusinessEmailTemplateForm
        action={updateBusinessEmailTemplateSettingsAction}
        key={`business-email-template-settings-${settings.updatedAt.getTime()}`}
        settings={settings}
      />
    </FeatureGate>
  );
}
