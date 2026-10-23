"use client";

import { useState } from "react";
import { ArrowUpRight, Check, CreditCard } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatPrice,
  getMonthlyEquivalentLabel,
  getPlanPriceLabel,
  getYearlySavingsPercent,
} from "@/lib/billing/plans";
import type {
  BillingCurrency,
  BillingInterval,
  PaidPlan,
} from "@/lib/billing/types";
import { planMeta, planTiers } from "@/lib/plans";
import { planCatalog } from "@/lib/plans/catalog";
import type { PlanTier } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

type PlanCard = {
  id: PlanTier;
  tagline: string;
  highlights: readonly string[];
};

const planCards: PlanCard[] = planTiers.map((plan) => ({
  id: plan,
  tagline: planCatalog[plan].audience,
  highlights: planCatalog[plan].highlights.slice(0, 4),
}));

type PlanSelectionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: PlanTier;
  /** Current business is inside its Pro trial and still needs to subscribe. */
  isTrialing?: boolean;
  targetPlan?: PaidPlan;
  onSelectPlan: (plan: PaidPlan, interval: BillingInterval) => void;
  /** Billing currency for the business; defaults to USD for a new business. */
  currency?: BillingCurrency;
  businessId?: string;
  businessSlug?: string;
};

export function PlanSelectionSheet({
  open,
  onOpenChange,
  currentPlan,
  isTrialing = false,
  targetPlan,
  onSelectPlan,
  currency = "USD",
  businessId,
  businessSlug,
}: PlanSelectionSheetProps) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [confirmingPlan, setConfirmingPlan] = useState<PaidPlan | null>(null);

  const isUpgrade = currentPlan !== "free" && !isTrialing;

  function handleSelectPlan(plan: PaidPlan) {
    if (isUpgrade) {
      // Show inline confirmation for paid→paid upgrades
      setConfirmingPlan(plan);
    } else {
      onSelectPlan(plan, interval);
    }
  }

  function handleConfirmUpgrade() {
    if (confirmingPlan) {
      onSelectPlan(confirmingPlan, interval);
      setConfirmingPlan(null);
    }
  }

  function handleOpenChange(value: boolean) {
    if (!value) setConfirmingPlan(null);
    onOpenChange(value);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[780px] lg:max-w-[860px]">
        <DialogHeader className="border-b-0">
          <DialogTitle>{isTrialing ? "Choose a plan" : "Upgrade Plan"}</DialogTitle>
          <DialogDescription>
            {isTrialing
              ? "Choose a paid plan to keep Pro features, or let the trial end and continue on Free."
              : "Choose the plan that fits your workflow."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-5 pb-5 sm:px-6 sm:pb-6">
          {/* Upgrade confirmation */}
          {confirmingPlan ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-muted/30 p-6 text-center">
              <div>
                <p className="text-base font-semibold text-foreground">
                  Upgrade to {planMeta[confirmingPlan].label}?
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground max-w-[40ch]">
                  Your plan will change immediately. The price difference will be
                  prorated on your next billing cycle.
                </p>
                <p className="mt-3 font-heading text-lg font-semibold text-foreground">
                  {getPlanPriceLabel(confirmingPlan, currency, interval)}
                </p>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingPlan(null)}
                    type="button"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirmUpgrade}
                    type="button"
                  >
                    <ArrowUpRight data-icon="inline-start" />
                    Confirm upgrade
                  </Button>
                </div>
                {businessId && (
                  <a
                    href={`/api/billing/polar/customer-portal?businessId=${encodeURIComponent(businessId)}${businessSlug ? `&businessSlug=${encodeURIComponent(businessSlug)}` : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <CreditCard className="size-3.5" />
                    Change payment method
                  </a>
                )}
              </div>
            </div>
          ) : (
            <>
          {/* Billing interval toggle */}
          <div className="flex justify-center">
            <div className="inline-flex items-center rounded-lg border border-border/70 bg-muted/50 p-0.5">
              <button
                type="button"
                onClick={() => setInterval("yearly")}
                className={cn(
                  "relative inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  interval === "yearly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Annual
                <Badge variant="secondary" className="px-1 font-medium text-xs">
                  -{getYearlySavingsPercent("pro", currency)}%
                </Badge>
              </button>
              <button
                type="button"
                onClick={() => setInterval("monthly")}
                className={cn(
                  "relative inline-flex items-center rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                  interval === "monthly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Monthly
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            {planCards.map((card) => {
              const isCurrentPlan = currentPlan === card.id && !isTrialing;
              const isPreferredPlan =
                !isCurrentPlan &&
                (targetPlan === card.id ||
                  (!targetPlan &&
                    card.id === "pro" &&
                    (currentPlan === "free" || isTrialing)) ||
                  (!targetPlan &&
                    card.id === "business" &&
                    currentPlan === "pro" &&
                    !isTrialing));
              const isPaidPlan = card.id !== "free";
              const isDowngrade =
                isPaidPlan && currentPlan === "business" && card.id === "pro";

              return (
                <div
                  className={cn(
                    "flex flex-col rounded-xl border border-border/70 bg-card/80 p-4",
                    isPreferredPlan &&
                      "border-primary/30 bg-accent/20 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]",
                  )}
                  key={card.id}
                >
                  {/* Plan name */}
                  <h3 className="font-heading text-base font-semibold text-foreground">
                    {planMeta[card.id].label}
                  </h3>

                  {/* Price */}
                  <div className="mt-1.5">
                    {isPaidPlan ? (
                      <>
                        <p className="font-heading text-xl font-semibold tracking-tight text-foreground">
                          {getPlanPriceLabel(card.id as PaidPlan, currency, interval)}
                        </p>
                        {interval === "yearly" ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {getMonthlyEquivalentLabel(card.id as PaidPlan, currency)} billed yearly
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            billed monthly
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-heading text-xl font-semibold tracking-tight text-foreground">
                          {formatPrice(0, currency)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          free forever
                        </p>
                      </>
                    )}
                  </div>

                  {/* CTA */}
                  <div className="mt-3">
                    {isCurrentPlan ? (
                      <Button
                        className="w-full"
                        disabled
                        variant="outline"
                        size="sm"
                        type="button"
                      >
                        Current plan
                      </Button>
                    ) : isPaidPlan && !isDowngrade ? (
                      <Button
                        className="w-full"
                        onClick={() => handleSelectPlan(card.id as PaidPlan)}
                        variant={isPreferredPlan ? "default" : "outline"}
                        size="sm"
                        type="button"
                      >
                        <ArrowUpRight data-icon="inline-start" />
                        {card.id === "pro"
                          ? isTrialing
                            ? "Subscribe to Pro"
                            : "Upgrade to Pro"
                          : "Upgrade to Business"}
                      </Button>
                    ) : isPaidPlan && isDowngrade ? (
                      <Button
                        className="w-full"
                        disabled
                        variant="outline"
                        size="sm"
                        type="button"
                      >
                        Downgrade
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        disabled
                        variant="outline"
                        size="sm"
                        type="button"
                      >
                        {isTrialing ? "Default after trial" : "Free plan"}
                      </Button>
                    )}
                  </div>

                  {/* Features */}
                  <p className="mt-4 text-xs font-medium text-muted-foreground">
                    {card.tagline}
                  </p>
                  <ul className="mt-2 grid gap-1.5">
                    {card.highlights.map((highlight) => (
                      <li className="flex items-start gap-2" key={highlight}>
                        <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        <span className="text-sm text-muted-foreground">
                          {highlight}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
