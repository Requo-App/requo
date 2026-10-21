import type { Metadata } from "next";
import { Suspense } from "react";

import { BillingStatusStaticFallback } from "@/components/shell/settings-body-skeletons";
import { BillingStatusCard } from "@/features/billing/components/billing-status-card";
import { getBusinessBillingOverview } from "@/features/billing/queries";
import {
  getMonthlyAutoFollowUpSendCount,
  getMonthlyRequoDocumentSendCount,
} from "@/lib/plans/usage";
import { getMonthlyUsageSummary } from "@/lib/ai/usage-limiter";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOwnerPageContext } from "../_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Billing",
  description: "Business subscription, credits usage, and billing details.",
});

export const instant = true;

export default function BillingSettingsPage() {
  return (
    <>
      <h1 className="sr-only">Billing</h1>

      <div className="mx-auto w-full max-w-2xl">
        <Suspense fallback={<BillingStatusStaticFallback />}>
          <BillingStatusSection />
        </Suspense>
      </div>
    </>
  );
}

async function BillingStatusSection() {
  const { businessContext } = await getBusinessOwnerPageContext();
  const businessId = businessContext.business.id;

  const billingOverview = await getBusinessBillingOverview(businessId);

  if (!billingOverview) return null;

  const plan = billingOverview.currentPlan;
  const [aiUsage, requoDocumentEmailsThisMonth, autoFollowUpEmailsThisMonth] =
    await Promise.all([
      getMonthlyUsageSummary(businessId, plan),
      getMonthlyRequoDocumentSendCount(businessId),
      getMonthlyAutoFollowUpSendCount(businessId),
    ]);

  return (
    <BillingStatusCard
      billing={billingOverview}
      planUsage={{
        aiCredits: { used: aiUsage.used, limit: aiUsage.limit },
        emailsSent: requoDocumentEmailsThisMonth,
        autoFollowUpEmailsSent: autoFollowUpEmailsThisMonth,
      }}
    />
  );
}
