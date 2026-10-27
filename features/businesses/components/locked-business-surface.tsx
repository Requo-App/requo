import { LockKeyhole, ArrowUpRight } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import type { BusinessBillingOverview } from "@/features/billing/types";
import type { BusinessContext } from "@/lib/db/business-access";

type LockedBusinessSurfaceProps = {
  billing: BusinessBillingOverview;
  businessContext: BusinessContext;
};

export function LockedBusinessSurface({
  billing,
  businessContext,
}: LockedBusinessSurfaceProps) {
  return (
    <Alert className="mb-6 border-warning/30 bg-warning/10 text-warning-ink">
      <LockKeyhole className="size-4" />
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">
            This business is locked on your current plan
          </p>
          <p className="text-sm">
            You can still view historical records and export data. Upgrade to
            unlock inquiry, quote, follow-up, forms, member, and settings
            actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <UpgradeButton
            currentPlan={billing.currentPlan}
            size="sm"
            userId={billing.userId}
            businessId={billing.businessId}
            businessSlug={billing.businessSlug}
          >
            <ArrowUpRight data-icon="inline-start" />
            Upgrade to unlock
          </UpgradeButton>
          <Button asChild size="sm" variant="outline">
            <a
              href={`/api/business/${businessContext.business.slug}/inquiries/export`}
            >
              Export inquiries
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/business/${businessContext.business.slug}/quotes/export`}>
              Export quotes
            </a>
          </Button>
        </div>
      </div>
    </Alert>
  );
}

