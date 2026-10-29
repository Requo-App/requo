"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useBusinessCheckout } from "@/features/billing/components/business-checkout-provider";
import { PlanSelectionSheet } from "@/features/billing/components/plan-selection-sheet";
import { usePlanSelection } from "@/features/billing/components/plan-selection-provider";
import { startPolarCheckout } from "@/features/billing/start-checkout";
import { getBusinessHomePath } from "@/features/businesses/routes";
import type {
  BillingCurrency,
  BillingInterval,
  PaidPlan,
} from "@/lib/billing/types";
import type { PlanTier as plan } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

type UpgradeButtonProps = {
  userId: string;
  businessId: string;
  businessSlug: string;
  currentPlan: plan;
  /** Current business is inside its Pro trial and still needs to subscribe. */
  isTrialing?: boolean;
  /** Billing currency to show in the self-contained plan sheet. */
  currency?: BillingCurrency;
  targetPlan?: "pro" | "business";
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
  /** Notify the host that the plan picker is opening (e.g. close its dropdown). */
  onOpen?: () => void;
  children?: React.ReactNode;
};

function resolveTargetPlan(
  currentPlan: plan,
  targetPlan?: PaidPlan,
  isTrialing = false,
): PaidPlan {
  if (targetPlan) {
    return targetPlan;
  }
  // A trial grants Pro without a paid subscription. The next paid action is
  // subscribing to Pro, not upgrading past it.
  if (isTrialing) {
    return "pro";
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
 * When rendered outside that provider, it hands the request to the shell's
 * `PlanSelectionProvider` so the sheet survives its dropdown closing. A local
 * self-contained sheet remains the last-resort fallback.
 */
export function UpgradeButton({
  businessId,
  businessSlug,
  currentPlan,
  isTrialing = false,
  currency = "USD",
  targetPlan,
  variant = "default",
  size = "sm",
  className,
  onOpen,
  children,
}: UpgradeButtonProps) {
  const businessCheckout = useBusinessCheckout();
  const planSelection = usePlanSelection();
  const usingProvider =
    businessCheckout != null && businessCheckout.businessId === businessId;
  const usingShellProvider = !usingProvider && planSelection != null;

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

  const nextPlan = resolveTargetPlan(
    effectiveCurrentPlan,
    targetPlan,
    isTrialing,
  );

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    onOpen?.();
    if (usingProvider) {
      businessCheckout.openPlanSelection(nextPlan);
      return;
    }
    if (usingShellProvider) {
      planSelection.openPlanSelection({
        businessId,
        businessSlug,
        currency,
        currentPlan: effectiveCurrentPlan,
        isTrialing,
        targetPlan: nextPlan,
      });
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
    : usingShellProvider
      ? planSelection.isStartingCheckout
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

      {!usingProvider && !usingShellProvider ? (
        <PlanSelectionSheet
          currentPlan={effectiveCurrentPlan}
          currency={currency}
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
