import { DashboardSection } from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import type {
  AdminBusinessBilling,
  AdminBusinessSubscriptionSummary,
} from "@/features/admin/types";
import type { SubscriptionStatus } from "@/lib/billing/types";
import { isPlanTier, planMeta } from "@/lib/plans";

const subscriptionStatusVariant: Record<
  SubscriptionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  free: "outline",
  trialing: "secondary",
  pending: "secondary",
  active: "default",
  past_due: "destructive",
  paused: "outline",
  canceled: "outline",
  expired: "outline",
  incomplete: "secondary",
};

function formatTimestamp(value: Date | null): string {
  if (!value) {
    return "—";
  }

  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AdminBusinessBillingSectionProps = {
  billing: AdminBusinessBilling;
};

/**
 * Subscription section for the admin business detail page (read-only).
 *
 * One fact only: the business's plan and billing status, read from the
 * business-scoped `business_subscriptions` row (free when there is no
 * row). Plan changes run through the header toolbar.
 */
export function AdminBusinessBillingSection({
  billing,
}: AdminBusinessBillingSectionProps) {
  return (
    <DashboardSection
      description="The business's plan and billing status."
      title="Subscription"
    >
      <BusinessSubscriptionRow subscription={billing.subscription} />
    </DashboardSection>
  );
}

function SubscriptionRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="meta-label">{label}</dt>
      <dd className="mt-1 text-sm text-foreground break-words">{value}</dd>
    </div>
  );
}

function BusinessSubscriptionRow({
  subscription,
}: {
  subscription: AdminBusinessSubscriptionSummary | null;
}) {
  if (!subscription) {
    return (
      <div className="min-w-0">
        <p className="meta-label">Plan</p>
        <div className="mt-1">
          <Badge variant="outline">{planMeta.free.label}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          No subscription for this business.
        </p>
      </div>
    );
  }

  return (
    <dl className="grid gap-5 sm:grid-cols-2">
      <SubscriptionRow
        label="Plan"
        value={
          <Badge variant={subscription.plan === "free" ? "outline" : "secondary"}>
            {isPlanTier(subscription.plan)
              ? planMeta[subscription.plan].label
              : subscription.plan}
          </Badge>
        }
      />
      <SubscriptionRow
        label="Status"
        value={
          <Badge variant={subscriptionStatusVariant[subscription.status]}>
            {subscription.status}
          </Badge>
        }
      />
      <SubscriptionRow label="Provider" value={subscription.provider} />
      <SubscriptionRow
        label="Current period ends"
        value={formatTimestamp(subscription.currentPeriodEnd)}
      />
      {subscription.canceledAt ? (
        <SubscriptionRow
          label="Canceled at"
          value={formatTimestamp(subscription.canceledAt)}
        />
      ) : null}
    </dl>
  );
}
