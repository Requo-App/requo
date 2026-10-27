"use client";

/**
 * Billing settings sections for business settings.
 *
 * Stacked reference-style layout: subscription summary, credits usage,
 * billing management (Polar customer portal), and cancellation.
 * Subscription changes (upgrade, payment method, cancel, refund) all happen
 * in the Polar customer portal; this UI summarizes state and deep-links there.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  CalendarDays,
  ChartColumn,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  Clock,
  CreditCard,
  Crown,
  Mail,
  Sparkles,
  Tag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StartTrialButton } from "@/features/billing/components/start-trial-button";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import { PaymentMethodIcon } from "@/features/billing/components/payment-method-icon";
import type { BusinessBillingOverview } from "@/features/billing/types";
import { getBusinessAnalyticsPath } from "@/features/businesses/routes";
import { getPlanPriceLabel } from "@/lib/billing/plans";
import type { PaidPlan } from "@/lib/billing/types";
import { planMeta } from "@/lib/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";

export type BillingPlanUsage = {
  aiCredits: { used: number; limit: number };
  /** Requo quote and invoice emails sent in the current month. */
  emailsSent: number;
  /** Automatic follow-up emails sent in the current month. */
  autoFollowUpEmailsSent: number;
};

type BillingStatusCardProps = {
  billing: BusinessBillingOverview;
  planUsage: BillingPlanUsage;
  /** Owners can change the plan; managers/staff get a read-only view. */
  canManageBilling: boolean;
};

export function BillingStatusCard({
  billing,
  planUsage,
  canManageBilling,
}: BillingStatusCardProps) {
  const { subscription, currentPlan, userId, businessId, businessSlug } =
    billing;

  const isFreePlan = currentPlan === "free";
  const isTrialing =
    subscription?.status === "trialing" && currentPlan === "pro";
  // Before the daily expiry cron flips the row, an ended trial still has the
  // `trialing` status while the effective plan is already Free.
  const isLapsedTrial =
    subscription?.status === "trialing" && !isTrialing;
  const hasActiveSubscription =
    subscription &&
    (subscription.status === "active" || subscription.status === "past_due");
  const hasPendingSubscription =
    subscription && subscription.status === "pending";
  const hasPausedSubscription =
    subscription && subscription.status === "paused";
  const hasCanceledSubscription =
    subscription && subscription.status === "canceled";
  const hasSubscription =
    isTrialing ||
    hasActiveSubscription ||
    hasPendingSubscription ||
    hasPausedSubscription ||
    hasCanceledSubscription;
  const canManageInPortal =
    !isTrialing && Boolean(hasSubscription) && !!subscription?.providerCustomerId;

  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);

  const renewalDate = isTrialing || isLapsedTrial
    ? (subscription?.trialEndsAt ?? subscription?.currentPeriodEnd ?? null)
    : (subscription?.currentPeriodEnd ?? null);
  const currency = billing.billingCurrency;
  const priceLabel = isFreePlan
    ? "Free"
    : getPlanPriceLabel(currentPlan as PaidPlan, currency, "monthly");
  const emailsLimit = getUsageLimit(currentPlan, "requoDocumentEmailsPerMonth");
  const autoFollowUpEmailsLimit = getUsageLimit(
    currentPlan,
    "autoFollowUpEmailsPerMonth",
  );
  const portalHref = `/api/billing/polar/customer-portal?businessId=${encodeURIComponent(
    businessId,
  )}&businessSlug=${encodeURIComponent(businessSlug)}`;

  let subscriptionLine: string;
  if (isLapsedTrial) {
    subscriptionLine = renewalDate
      ? `Your Pro trial ended ${formatBillingDate(renewalDate)}. The business is now on Free and your data stays available.`
      : "Your Pro trial has ended. The business is now on Free and your data stays available.";
  } else if (isTrialing && renewalDate) {
    subscriptionLine = `Your Pro trial ends ${formatBillingDate(renewalDate)}. Choose a plan to keep Pro features; otherwise the business moves to Free and your data stays available.`;
  } else if (
    subscription?.canceledAt &&
    (subscription.status === "active" ||
      subscription.status === "canceled") &&
    renewalDate
  ) {
    subscriptionLine = `Access until ${formatBillingDate(renewalDate)}. Your business returns to the Free plan after that.`;
  } else if (subscription?.status === "past_due") {
    subscriptionLine =
      "Your last payment failed. Update your payment method to keep your plan.";
  } else if (hasPausedSubscription) {
    subscriptionLine =
      "Your subscription is paused. Resume it from the billing portal to restore your plan.";
  } else if (hasActiveSubscription && renewalDate) {
    subscriptionLine = `Next charge ${formatBillingDate(renewalDate)}.`;
  } else if (hasPendingSubscription) {
    subscriptionLine = renewalDate
      ? `Starts ${formatBillingDate(renewalDate)}.`
      : "Your subscription is being set up.";
  } else {
    subscriptionLine = planMeta[currentPlan].description;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Subscription */}
      <section
        aria-labelledby="billing-subscription-heading"
        className="flex flex-col gap-2"
      >
        <h2
          id="billing-subscription-heading"
          className="text-sm font-semibold text-foreground"
        >
          Subscription
        </h2>
        <p className="text-sm text-muted-foreground">{subscriptionLine}</p>
        {!canManageBilling ? (
          <p className="text-xs text-muted-foreground">
            Only the business owner can change the plan or payment method.
          </p>
        ) : null}

        <Card className="border-border/75 bg-card">
          <CardContent className="flex flex-col gap-5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {planMeta[currentPlan].label} plan
                </h3>
                {hasSubscription ? (
                  <StatusBadge
                    status={subscription.status}
                    canceled={!!subscription.canceledAt}
                  />
                ) : null}
              </div>
              {canManageBilling ? (
                currentPlan !== "business" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <UpgradeButton
                      currency={currency}
                      currentPlan={currentPlan}
                      isTrialing={isTrialing}
                      userId={userId}
                      businessId={businessId}
                      businessSlug={businessSlug}
                      variant="outline"
                    >
                      Compare plans
                    </UpgradeButton>
                    {isTrialing ? (
                      <UpgradeButton
                        currency={currency}
                        currentPlan={currentPlan}
                        isTrialing={isTrialing}
                        userId={userId}
                        businessId={businessId}
                        businessSlug={businessSlug}
                        targetPlan="pro"
                      >
                        <ArrowUpRight data-icon="inline-start" />
                        Choose a plan
                      </UpgradeButton>
                    ) : isFreePlan && billing.canStartTrial ? (
                      <StartTrialButton
                        businessId={businessId}
                        businessSlug={businessSlug}
                      />
                    ) : (
                      <UpgradeButton
                        currency={currency}
                        currentPlan={currentPlan}
                        userId={userId}
                        businessId={businessId}
                        businessSlug={businessSlug}
                      >
                        <ArrowUpRight data-icon="inline-start" />
                        {isFreePlan ? "Subscribe Now" : "Upgrade plan"}
                      </UpgradeButton>
                    )}
                  </div>
                ) : (
                  <Button disabled variant="outline" size="sm">
                    Highest plan active
                  </Button>
                )
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              <div className="flex flex-col gap-3">
                <DetailRow
                  icon={Crown}
                  label="Plan"
                  value={planMeta[currentPlan].label}
                />
                <DetailRow
                  icon={CalendarDays}
                  label={
                    isTrialing
                      ? "Trial ends"
                      : isLapsedTrial
                        ? "Trial ended"
                        : "Renewal date"
                  }
                  value={formatBillingDate(renewalDate)}
                />
                <DetailRow
                  label="Payment method"
                  value={
                    isTrialing
                      ? "No payment method required"
                      : subscription?.paymentMethod
                        ? getPaymentMethodDisplay(
                            subscription.provider,
                            subscription.paymentMethod,
                          )
                        : "No payment method"
                  }
                  leading={
                    <PaymentMethodIcon method={subscription?.paymentMethod} />
                  }
                />
              </div>
              <div className="flex flex-col gap-3 sm:border-l sm:border-border sm:pl-6">
                <DetailRow
                  icon={Tag}
                  label="Price"
                  value={priceLabel}
                  detail={
                    isFreePlan
                      ? undefined
                      : isTrialing
                        ? "if you subscribe"
                        : "monthly estimate"
                  }
                />
                <DetailRow
                  icon={Mail}
                  label="Emails included"
                  value={
                    emailsLimit === null
                      ? "Unlimited"
                      : `${emailsLimit.toLocaleString()} /month`
                  }
                />
              </div>
            </div>

            {subscription?.canceledAt &&
            (subscription.status === "active" ||
              subscription.status === "canceled") ? (
              <Alert
                variant="default"
                className="border-warning/30 bg-warning/10 py-3 text-warning-ink [&>svg]:text-warning-ink"
              >
                <CircleAlert className="size-4" />
                <div>
                  <p className="text-sm font-medium">Subscription canceling</p>
                  <p className="mt-0.5 text-xs">
                    You&apos;ll keep full access until the end of the billing
                    period.
                  </p>
                </div>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* Credits */}
      <section
        aria-labelledby="billing-credits-heading"
        className="flex flex-col gap-2"
      >
        <h2
          id="billing-credits-heading"
          className="text-sm font-semibold text-foreground"
        >
          Credits
        </h2>
        <p className="text-sm text-muted-foreground">
          Credits are used by AI quote drafts, the assistant, and agent chats.
        </p>

        <Card className="border-border/75 bg-card">
          <CardContent className="flex flex-col gap-5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Sparkles
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold">
                    {planUsage.aiCredits.limit.toLocaleString()} credits
                  </span>{" "}
                  <span className="text-muted-foreground">/month</span>
                </span>
              </p>
              {canManageBilling ? (
                canManageInPortal ? (
                  <Button size="sm" asChild>
                    <a
                      href={portalHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Manage
                    </a>
                  </Button>
                ) : currentPlan !== "business" ? (
                  <UpgradeButton
                    currency={currency}
                    currentPlan={currentPlan}
                    userId={userId}
                    businessId={businessId}
                    businessSlug={businessSlug}
                  >
                    Manage
                  </UpgradeButton>
                ) : null
              ) : null}
            </div>

            <UsageBar
              ariaLabel="AI credits remaining this month"
              used={planUsage.aiCredits.used}
              limit={planUsage.aiCredits.limit}
              unit="credits"
              note="Resets monthly"
            />

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Mail
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold">
                    {emailsLimit === null
                      ? "Unlimited email sends"
                      : `${emailsLimit.toLocaleString()} email sends`}
                  </span>{" "}
                  {emailsLimit === null ? null : (
                    <span className="text-muted-foreground">/month</span>
                  )}
                </span>
              </p>
              <UsageBar
                ariaLabel="Requo email sends remaining this month"
                used={planUsage.emailsSent}
                limit={emailsLimit ?? planUsage.emailsSent}
                unit="emails"
                note={`Included in ${planMeta[currentPlan].label}`}
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <BellRing
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold">
                    {autoFollowUpEmailsLimit === null
                      ? "Unlimited auto follow-ups"
                      : autoFollowUpEmailsLimit === 0
                        ? "No auto follow-ups"
                        : `${autoFollowUpEmailsLimit.toLocaleString()} auto follow-ups`}
                  </span>{" "}
                  {autoFollowUpEmailsLimit ? (
                    <span className="text-muted-foreground">/month</span>
                  ) : null}
                </span>
              </p>
              {autoFollowUpEmailsLimit ? (
                <UsageBar
                  ariaLabel="Auto follow-up emails remaining this month"
                  used={planUsage.autoFollowUpEmailsSent}
                  limit={autoFollowUpEmailsLimit}
                  unit="emails"
                  note={`Included in ${planMeta[currentPlan].label}`}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Automatic follow-ups are available on Pro and Business.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={getBusinessAnalyticsPath(businessSlug)}>
                  <ChartColumn data-icon="inline-start" />
                  View usage
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setCreditsDialogOpen(true)}
              >
                How credits work
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Manage billing information */}
      {canManageBilling && canManageInPortal ? (
        <section
          aria-labelledby="billing-manage-heading"
          className="flex flex-col gap-2"
        >
          <h2
            id="billing-manage-heading"
            className="text-sm font-semibold text-foreground"
          >
            Manage billing information
          </h2>
          <p className="text-sm text-muted-foreground">
            Edit payment method, see your invoices and more
          </p>
          <div>
            <Button variant="outline" size="sm" asChild>
              <a href={portalHref} target="_blank" rel="noopener noreferrer">
                <CreditCard data-icon="inline-start" />
                View billing details
              </a>
            </Button>
          </div>
        </section>
      ) : null}

      {/* Cancel */}
      {canManageBilling && canManageInPortal ? (
        <section
          aria-labelledby="billing-cancel-heading"
          className="flex flex-col gap-2"
        >
          <h2
            id="billing-cancel-heading"
            className="text-sm font-semibold text-foreground"
          >
            Cancel your subscription
          </h2>
          <p className="text-sm text-muted-foreground">
            Your business returns to the Free plan at the end of the billing
            period
          </p>
          <div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive-ink hover:text-destructive-ink"
              asChild
            >
              <a href={portalHref} target="_blank" rel="noopener noreferrer">
                <CircleMinus data-icon="inline-start" />
                Cancel plan
              </a>
            </Button>
          </div>
        </section>
      ) : null}

      <Dialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>How credits work</DialogTitle>
            <DialogDescription>
              One monthly allowance covers every AI feature in your business.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
            <li>AI quote draft: 3 credits per draft.</li>
            <li>Quote improvement: 2 credits per run.</li>
            <li>Assistant or agent message: 1 credit each.</li>
            <li>Unused credits reset at the start of each month.</li>
            <li>Upgrade your plan for a larger monthly allowance.</li>
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Detail row ─────────────────────────────────────────────────────────── */

function DetailRow({
  icon: Icon,
  label,
  value,
  detail,
  leading,
}: {
  icon?: React.ElementType;
  label: string;
  value: string;
  detail?: string;
  leading?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {Icon ? (
        <Icon
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
      {leading}
      <p className="min-w-0 truncate text-sm">
        <span className="text-muted-foreground">{label} </span>
        <span className="font-semibold text-foreground">{value}</span>
        {detail ? (
          <span className="text-muted-foreground"> ({detail})</span>
        ) : null}
      </p>
    </div>
  );
}

/* ── Usage bar ──────────────────────────────────────────────────────────── */

function UsageBar({
  ariaLabel,
  used,
  limit,
  unit,
  note,
}: {
  ariaLabel: string;
  used: number;
  limit: number;
  unit: string;
  note: string;
}) {
  // The bar represents the remaining allowance: it starts full and drains
  // as the month's credits are consumed.
  const usedPct =
    limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const remainingPct = Math.max(0, 100 - usedPct);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={remainingPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-all motion-reduce:transition-none"
          style={{ width: `${remainingPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{note}</span>
        <span className="tabular-nums">
          {used.toLocaleString()} {unit} used · {remainingPct} % left
        </span>
      </div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function formatBillingDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPaymentMethodDisplay(provider: string, method?: string | null) {
  if (!method) return "Credit or debit card";

  switch (method.toLowerCase()) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "paypal":
      return "PayPal";
    case "apple_pay":
      return "Apple Pay";
    case "google_pay":
      return "Google Pay";
    case "amex":
      return "American Express";
    case "discover":
      return "Discover";
    case "diners_club":
      return "Diners Club";
    case "jcb":
      return "JCB";
    case "unionpay":
      return "UnionPay";
    case "card":
      return "Credit Card";
    default:
      return method.charAt(0).toUpperCase() + method.slice(1);
  }
}

/* ── Status badge ─────────────────────────────────────────────────────────── */

const statusConfig: Record<
  string,
  { label: string; variant: "secondary" | "destructive" | "outline" }
> = {
  trialing: { label: "Trial", variant: "secondary" },
  active: { label: "Active", variant: "secondary" },
  canceled: { label: "Canceling", variant: "outline" },
  past_due: { label: "Past due", variant: "destructive" },
  paused: { label: "Paused", variant: "outline" },
  pending: { label: "Pending", variant: "outline" },
  expired: { label: "Expired", variant: "outline" },
  incomplete: { label: "Incomplete", variant: "outline" },
};

function StatusBadge({
  status,
  canceled,
}: {
  status: string;
  canceled?: boolean;
}) {
  // If active but canceledAt is set, show "Canceling" instead of "Active"
  const effectiveStatus = status === "active" && canceled ? "canceled" : status;
  const config = statusConfig[effectiveStatus];

  if (!config) {
    return <Badge variant="outline">Free</Badge>;
  }

  const Icon =
    effectiveStatus === "active"
      ? CircleCheck
      : effectiveStatus === "past_due"
        ? CircleAlert
        : effectiveStatus === "pending"
          ? Clock
          : effectiveStatus === "incomplete"
            ? CircleDashed
            : CircleMinus;

  return (
    <Badge variant={config.variant}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}
