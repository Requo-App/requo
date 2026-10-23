"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useBusinessCheckout } from "@/features/billing/components/business-checkout-provider";
import { PlanSelectionSheet } from "@/features/billing/components/plan-selection-sheet";
import { startPolarCheckout } from "@/features/billing/start-checkout";
import { getBusinessHomePath } from "@/features/businesses/routes";
import type { BillingInterval, PaidPlan } from "@/lib/billing/types";
import type { PlanTier as plan } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

type UpgradeButtonProps = {
  userId: string;
  businessId: string;
  businessSlug: string;
  currentPlan: plan;
  /** Current business is inside its Pro trial and still needs to subscribe. */
  isTrialing?: boolean;
  targetPlan?: "pro" | "business";
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
  children?: React.ReactNode;
};

function resolveTargetPlan(currentPlan: plan, targetPlan?: PaidPlan): PaidPlan {
  if (targetPlan) {
    return targetPlan;
  }
  return currentPlan === "pro" ? "business" : "pro";
}

/**
 * UpgradeButton renders a button that opens the plan selection sheet.
 *
 * When mounted inside a `BusinessCheckoutProvider`, it delegates open/close
 * and checkout state to the provider so multiple UpgradeButtons on the same
 * page share a single sheet and a single in-flight checkout transition.
 *
 * When rendered outside the provider (settings routes, upgrade popovers in
 * deep layouts, etc.), it falls back to a self-contained PlanSelectionSheet
 * using the props it already receives. This guarantees every UpgradeButton
 * opens the plan sheet, regardless of where it's mounted.
 */
export function UpgradeButton({
  businessId,
  businessSlug,
  currentPlan,
  isTrialing = false,
  targetPlan,
  variant = "default",
  size = "sm",
  className,
  children,
}: UpgradeButtonProps) {
  const businessCheckout = useBusinessCheckout();
  const usingProvider =
    businessCheckout != null && businessCheckout.businessId === businessId;

  // When attached to the provider, mirror its state. Otherwise own it locally.
  const [localOpen, setLocalOpen] = useState(false);
  const [localTargetPlan, setLocalTargetPlan] = useState<PaidPlan | undefined>(
    targetPlan,
  );
  const [isLocalPending, startLocalTransition] = useTransition();

  const effectiveCurrentPlan = usingProvider
    ? businessCheckout.currentPlan
    : currentPlan;

  // No upgrade available for the highest plan — render nothing.
  if (effectiveCurrentPlan === "business") {
    return null;
  }

  const nextPlan = resolveTargetPlan(effectiveCurrentPlan, targetPlan);

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (usingProvider) {
      businessCheckout.openPlanSelection(nextPlan);
      return;
    }
    setLocalTargetPlan(nextPlan);
    setLocalOpen(true);
  }

  function handleSelectLocalPlan(
    selected: PaidPlan,
    interval: BillingInterval,
  ) {
    setLocalOpen(false);
    const returnTo = businessSlug
      ? getBusinessHomePath(businessSlug)
      : undefined;

    startLocalTransition(async () => {
      const result = await startPolarCheckout({
        businessId,
        plan: selected,
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

  const isPending = usingProvider
    ? !!businessCheckout.isStartingCheckout
    : isLocalPending;

  return (
    <>
      <Button
        type="button"
        className={cn(className)}
        disabled={isPending}
        onClick={handleClick}
        size={size}
        variant={variant}
      >
        {isPending ? (
          <>
            <Spinner data-icon="inline-start" aria-hidden="true" />
            {children ?? "Upgrading..."}
          </>
        ) : (
          children ?? (
            <>
              <ArrowUpRight data-icon="inline-start" />
              Upgrade Plan
            </>
          )
        )}
      </Button>

      {!usingProvider ? (
        <PlanSelectionSheet
          currentPlan={effectiveCurrentPlan}
          isTrialing={isTrialing}
          onOpenChange={setLocalOpen}
          onSelectPlan={handleSelectLocalPlan}
          open={localOpen}
          targetPlan={localTargetPlan}
          businessId={businessId}
          businessSlug={businessSlug}
        />
      ) : null}
    </>
  );
}
