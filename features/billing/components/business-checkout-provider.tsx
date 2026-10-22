"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { toast } from "@/components/shared/notify";

import { PlanSelectionSheet } from "@/features/billing/components/plan-selection-sheet";
import { startPolarCheckout } from "@/features/billing/start-checkout";
import type { BusinessBillingOverview } from "@/features/billing/types";
import { getBusinessHomePath } from "@/features/businesses/routes";
import type { BillingInterval, PaidPlan } from "@/lib/billing/types";
import type { PlanTier } from "@/lib/plans/plans";

type BusinessCheckoutContextValue = {
  currentPlan: PlanTier;
  userId: string;
  businessId: string;
  businessSlug: string;
  isStartingCheckout: boolean;
  openPlanSelection: (targetPlan?: PaidPlan) => void;
  openCheckout: (plan: PaidPlan, interval?: BillingInterval) => void;
};

const BusinessCheckoutContext =
  createContext<BusinessCheckoutContextValue | null>(null);

export function useBusinessCheckout() {
  return useContext(BusinessCheckoutContext);
}

export function BusinessCheckoutProvider({
  billing,
  children,
}: {
  billing: BusinessBillingOverview;
  children: ReactNode;
}) {
  const [isPlanSheetOpen, setIsPlanSheetOpen] = useState(false);
  const [sheetTargetPlan, setSheetTargetPlan] = useState<PaidPlan | undefined>(
    undefined,
  );
  const [isStartingCheckout, startTransition] = useTransition();

  const openCheckout = useCallback(
    (plan: PaidPlan, interval: BillingInterval = "monthly") => {
      const returnTo = billing.businessSlug
        ? getBusinessHomePath(billing.businessSlug)
        : undefined;

      startTransition(async () => {
        const result = await startPolarCheckout({
          businessId: billing.businessId,
          plan,
          interval,
          returnTo,
        });
        if (result.ok) {
          // Checkout opened in a new tab or redirected in same tab (upgrade).
          return;
        }

        if (result.reason === "already_subscribed") {
          toast.info(result.message);
          return;
        }

        toast.error(result.message);
      });
    },
    [billing.businessId, billing.businessSlug],
  );

  const openPlanSelection = useCallback((targetPlan?: PaidPlan) => {
    setSheetTargetPlan(targetPlan);
    setIsPlanSheetOpen(true);
  }, []);

  const value = useMemo<BusinessCheckoutContextValue>(
    () => ({
      businessId: billing.businessId,
      businessSlug: billing.businessSlug,
      currentPlan: billing.currentPlan,
      isStartingCheckout,
      openCheckout,
      openPlanSelection,
      userId: billing.userId,
    }),
    [billing, isStartingCheckout, openCheckout, openPlanSelection],
  );

  return (
    <>
      <BusinessCheckoutContext.Provider value={value}>
        {children}
      </BusinessCheckoutContext.Provider>
      <PlanSelectionSheet
        currentPlan={billing.currentPlan}
        onOpenChange={setIsPlanSheetOpen}
        onSelectPlan={(plan, interval) => {
          setIsPlanSheetOpen(false);
          openCheckout(plan, interval);
        }}
        open={isPlanSheetOpen}
        targetPlan={sheetTargetPlan}
        businessId={billing.businessId}
        businessSlug={billing.businessSlug}
      />
    </>
  );
}
