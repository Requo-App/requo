import type { PlanTier as plan } from "@/lib/plans/plans";
import type {
  BillingCurrency,
  BillingInterval,
  BillingProvider,
  PaidPlan,
  SubscriptionStatus,
} from "@/lib/billing/types";

/** Billing overview for the business billing UI. */
export type BusinessBillingOverview = {
  userId: string;
  /** Current business context (for display and navigation). */
  businessId: string;
  businessName: string;
  businessSlug: string;
  currentPlan: plan;
  /**
   * Currency to display for plan prices: the subscription's billing currency
   * when one exists, otherwise the visitor's detected pricing currency.
   */
  billingCurrency: BillingCurrency;
  subscription: {
    status: SubscriptionStatus;
    plan: string;
    provider: BillingProvider;
    currency: BillingCurrency;
    paymentMethod?: string | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
    canceledAt: Date | null;
    providerSubscriptionId: string | null;
    providerCustomerId: string | null;
  } | null;
  /** Owner is eligible for the one-time Pro trial on this business. */
  canStartTrial: boolean;
  downgradePreview: {
    targetPlan: plan;
    activeBusinessLimit: number | null;
    activeBusinesses: Array<{
      id: string;
      name: string;
      slug: string;
      lastOpenedAt: Date | null;
    }>;
    requiresSelection: boolean;
  };
};

/** Props for the checkout dialog. */
export type CheckoutDialogProps = {
  userId: string;
  businessId: string;
  businessName?: string;
  businessSlug: string;
  currentPlan: plan;
  plan: PaidPlan;
  interval?: BillingInterval;
};

/** Checkout action state for server action form submissions. */
export type CheckoutActionState = {
  error?: string;
  success?: string;
  checkoutUrl?: string;
};
