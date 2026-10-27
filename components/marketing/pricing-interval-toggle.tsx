"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SelectBusinessDialog } from "@/components/marketing/select-business-dialog";
import { cn } from "@/lib/utils";
import {
  formatPrice,
  getYearlySavingsPercent,
  getMonthlyEquivalentLabel,
  getPlanPriceLabel,
} from "@/lib/billing/plans";
import { homePath } from "@/features/businesses/routes";
import { authClient } from "@/lib/auth/client";
import { getAuthPathWithNext } from "@/lib/auth/redirects";
import { planCatalog } from "@/lib/plans/catalog";
import type {
  BillingCurrency,
  BillingInterval,
  PaidPlan,
} from "@/lib/billing/types";

/**
 * Outer wrapper: the URL is the source of truth for both the billing
 * interval and the deep-linked upgrade dialog. Interval and dialog state are
 * derived from search params during render; clicks update the URL via
 * `router.replace`. Deep links like /pricing?plan=pro&interval=yearly
 * preselect the interval and, for signed-in visitors, open the dialog with
 * no effect-driven setState anywhere.
 */
export function PricingIntervalToggle({
  currency,
}: {
  currency: BillingCurrency;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();

  const planParam = searchParams.get("plan");
  const intervalParam = searchParams.get("interval");
  const interval: BillingInterval =
    intervalParam === "yearly" ? "yearly" : "monthly";

  // Dialog opens only for a valid plan param while signed in; closing it
  // removes the param, which derives the open state back to false.
  const dialogPlan: PaidPlan | null =
    (planParam === "pro" || planParam === "business") && session?.user
      ? planParam
      : null;

  function updateUrlParam(key: "plan" | "interval", value: string | null) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-5 pt-2 pb-10 sm:px-6 lg:px-8 lg:pt-3 lg:pb-14">
      <PricingPlans
        currency={currency}
        dialogOpen={dialogPlan !== null}
        dialogPlan={dialogPlan}
        interval={interval}
        onDialogClose={() => updateUrlParam("plan", null)}
        onIntervalChange={(nextInterval) =>
          updateUrlParam("interval", nextInterval)
        }
        onOpenDialog={updateUrlParam}
        sessionUserId={session?.user ? session.user.id : null}
      />
    </section>
  );
}

function PricingPlans({
  currency,
  dialogOpen,
  dialogPlan,
  interval,
  onDialogClose,
  onIntervalChange,
  onOpenDialog,
  sessionUserId,
}: {
  currency: BillingCurrency;
  dialogOpen: boolean;
  dialogPlan: PaidPlan | null;
  interval: BillingInterval;
  onDialogClose: () => void;
  onIntervalChange: (interval: BillingInterval) => void;
  onOpenDialog: (key: "plan", plan: PaidPlan) => void;
  sessionUserId: string | null;
}) {
  const [pendingPlan, setPendingPlan] = useState<PaidPlan | null>(null);
  const [isPending, startTransition] = useTransition();
  const savingsPercent = getYearlySavingsPercent("pro", currency);

  function handleSubscribe(plan: PaidPlan) {
    if (isPending) return;

    if (sessionUserId) {
      onOpenDialog("plan", plan);
      return;
    }

    setPendingPlan(plan);
    startTransition(async () => {
      // Business-scoped billing requires a specific business context to start checkout.
      // From the marketing pricing page, route visitors through login first.
      const next = `/pricing?plan=${plan}&interval=${interval}`;
      window.location.assign(getAuthPathWithNext("/login", next));
    });
  }

  const proPrice = getPlanPriceLabel("pro", currency, interval).replace(
    interval === "monthly" ? "/mo" : "/yr",
    "",
  );
  const businessPrice = getPlanPriceLabel("business", currency, interval).replace(
    interval === "monthly" ? "/mo" : "/yr",
    "",
  );
  const proMonthly =
    interval === "yearly" ? getMonthlyEquivalentLabel("pro", currency) : null;
  const businessMonthly =
    interval === "yearly"
      ? getMonthlyEquivalentLabel("business", currency)
      : null;
  const period = interval === "monthly" ? "mo" : "yr";

  return (
    <>
      {/* Toggle */}
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-full border border-border bg-muted p-1">
          <button
            className={cn(
              "rounded-full px-5 py-2 text-sm font-medium transition-colors",
              interval === "monthly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onIntervalChange("monthly")}
            type="button"
          >
            Monthly
          </button>
          <button
            className={cn(
              "flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors",
              interval === "yearly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onIntervalChange("yearly")}
            type="button"
          >
            Yearly
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success-ink">
              -{savingsPercent}%
            </span>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        {/* Free */}
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Free
          </p>
          <p className="mt-4 font-heading text-4xl font-semibold tracking-tight text-foreground">
            {formatPrice(0, currency)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No card required
          </p>
          <p className="mt-4 min-h-12 text-sm leading-relaxed text-muted-foreground lg:min-h-18">
            {planCatalog.free.description} No time limit.
          </p>

          <Button asChild variant="outline" size="lg" className="mt-6 w-full font-mono text-xs uppercase tracking-wider">
            <Link href={sessionUserId ? homePath : "/signup"}>
              {sessionUserId ? "Go to dashboard" : "Start with inquiries"}
            </Link>
          </Button>

          <ul className="mt-7 flex flex-col gap-2.5 border-t border-border pt-6">
            {planCatalog.free.highlights.map((highlight) => (
              <Feature key={highlight}>{highlight}</Feature>
            ))}
          </ul>
        </div>

        {/* Pro */}
        <div className="relative flex h-full flex-col rounded-xl border border-primary/25 bg-card p-6 shadow-[var(--marketing-shadow-raised)] ring-1 ring-primary/[0.06] sm:p-7">
          <Badge className="absolute top-5 right-6 sm:right-7">
            Popular
          </Badge>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary-ink">
            Pro
          </p>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="font-heading text-4xl font-semibold tracking-tight text-foreground">
              {proPrice}
            </span>
            <span className="text-sm text-muted-foreground">/{period}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {proMonthly
              ? `${proMonthly} billed yearly`
              : "Cancel anytime"}
          </p>
          <p className="mt-4 min-h-12 text-sm leading-relaxed text-muted-foreground lg:min-h-18">
            {planCatalog.pro.description}
          </p>

          <Button
            className="mt-6 w-full font-mono text-xs uppercase tracking-wider"
            disabled={isPending}
            onClick={() => handleSubscribe("pro")}
            size="lg"
            type="button"
          >
            {isPending && pendingPlan === "pro" ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden="true" />
                Redirecting…
              </>
            ) : (
              "Start with Pro"
            )}
          </Button>

          <ul className="mt-7 flex flex-col gap-2.5 border-t border-border pt-6">
            {planCatalog.pro.highlights.map((highlight) => (
              <Feature key={highlight}>{highlight}</Feature>
            ))}
          </ul>
        </div>

        {/* Business */}
        <div className="flex h-full flex-col rounded-xl border border-border bg-card p-6 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Business
          </p>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="font-heading text-4xl font-semibold tracking-tight text-foreground">
              {businessPrice}
            </span>
            <span className="text-sm text-muted-foreground">/{period}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {businessMonthly
              ? `${businessMonthly} billed yearly`
              : "Cancel anytime"}
          </p>
          <p className="mt-4 min-h-12 text-sm leading-relaxed text-muted-foreground lg:min-h-18">
            {planCatalog.business.description}
          </p>

          <Button
            className="mt-6 w-full font-mono text-xs uppercase tracking-wider"
            disabled={isPending}
            onClick={() => handleSubscribe("business")}
            size="lg"
            type="button"
            variant="outline"
          >
            {isPending && pendingPlan === "business" ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden="true" />
                Redirecting…
              </>
            ) : (
              "Start with Business"
            )}
          </Button>

          <ul className="mt-7 flex flex-col gap-2.5 border-t border-border pt-6">
            {planCatalog.business.highlights.map((highlight) => (
              <Feature key={highlight}>{highlight}</Feature>
            ))}
          </ul>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
        Subscriptions are billed per business. Free includes one free business;
        additional businesses need their own paid subscription. Annual billing
        includes two months free. Taxes, where applicable, are calculated at
        checkout based on your billing country.
      </p>

      <SelectBusinessDialog
        currency={currency}
        interval={interval}
        onOpenChange={(open) => {
          if (!open) {
            onDialogClose();
          }
        }}
        open={dialogOpen}
        targetPlan={dialogPlan ?? "pro"}
      />
    </>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[0.82rem] leading-relaxed text-foreground">
      <Check aria-hidden="true" className="mt-[3px] size-3.5 shrink-0 text-primary-ink/80" />
      <span>{children}</span>
    </li>
  );
}
