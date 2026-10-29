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
import { getBusinessHomePath } from "@/features/businesses/routes";
import type {
  BillingCurrency,
  BillingInterval,
  PaidPlan,
} from "@/lib/billing/types";
import type { PlanTier } from "@/lib/plans/plans";

type PlanSelectionRequest = {
  businessId: string;
  businessSlug: string;
  currentPlan: PlanTier;
  isTrialing?: boolean;
  currency?: BillingCurrency;
  targetPlan?: PaidPlan;
};

type PlanSelectionContextValue = {
  isStartingCheckout: boolean;
  openPlanSelection: (request: PlanSelectionRequest) => void;
};

const PlanSelectionContext = createContext<PlanSelectionContextValue | null>(
  null,
);

export function usePlanSelection() {
  return useContext(PlanSelectionContext);
}

/**
 * Owns one plan-selection sheet for shell chrome that renders outside a
 * `BusinessCheckoutProvider` — the business switchers and the profile menu.
 *
 * A self-contained sheet mounted inside a dropdown is unmounted as soon as the
 * dropdown closes, so those triggers hand the request to this provider instead.
 * It renders the single sheet next to the shell, above every overlay layer.
 */
export function PlanSelectionProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PlanSelectionRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [isStartingCheckout, startTransition] = useTransition();

  const openPlanSelection = useCallback((next: PlanSelectionRequest) => {
    setRequest(next);
    setOpen(true);
  }, []);

  function handleSelectPlan(plan: PaidPlan, interval: BillingInterval) {
    setOpen(false);
    if (!request) return;

    const returnTo = request.businessSlug
      ? getBusinessHomePath(request.businessSlug)
      : undefined;

    startTransition(async () => {
      const result = await startPolarCheckout({
        businessId: request.businessId,
        plan,
        interval,
        returnTo,
      });

      if (result.ok) {
        return;
      }

      if (result.reason === "already_subscribed") {
        toast.info(result.message);
        return;
      }

      toast.error(result.message);
    });
  }

  const value = useMemo<PlanSelectionContextValue>(
    () => ({ isStartingCheckout, openPlanSelection }),
    [isStartingCheckout, openPlanSelection],
  );

  return (
    <PlanSelectionContext.Provider value={value}>
      {children}
      {request ? (
        <PlanSelectionSheet
          businessId={request.businessId}
          businessSlug={request.businessSlug}
          currency={request.currency}
          currentPlan={request.currentPlan}
          isTrialing={request.isTrialing}
          onOpenChange={setOpen}
          onSelectPlan={handleSelectPlan}
          open={open}
          targetPlan={request.targetPlan}
        />
      ) : null}
    </PlanSelectionContext.Provider>
  );
}
