import "server-only";

import { env } from "@/lib/env";
import {
  parseDeploymentMode,
  type DeploymentMode,
} from "@/lib/deployment-mode";
import type { PlanTier } from "@/lib/plans/plans";

export type { DeploymentMode };

/**
 * Self-hosted installations are not assigned a Requo Cloud plan. Plan
 * entitlement checks still need a tier, so read paths use the full product
 * tier. This value is never written to `businesses.plan` or
 * `business_subscriptions`; it only answers "does this deployment include the
 * feature" and keeps Cloud plan restrictions out of independent installs.
 */
export const selfHostedEntitlementPlan: PlanTier = "business";

export function getDeploymentMode(): DeploymentMode {
  return parseDeploymentMode(env.REQUO_DEPLOYMENT_MODE);
}

export function isCloudDeployment(): boolean {
  return getDeploymentMode() === "cloud";
}

export function isSelfHostedDeployment(): boolean {
  return getDeploymentMode() === "self-hosted";
}

export type BillingDriver = "none" | "polar" | "paymongo";
export type BillingProvider = Exclude<BillingDriver, "none">;
export type EntitlementPolicy = "full" | "plans";

/**
 * Billing is a deployment capability, not an edition. Explicit
 * `REQUO_BILLING_DRIVER` wins; otherwise Cloud keeps Polar and self-hosted
 * installs stay billing-free as before.
 */
export function getBillingDriver(): BillingDriver {
  if (env.REQUO_BILLING_DRIVER) {
    return env.REQUO_BILLING_DRIVER;
  }

  return isSelfHostedDeployment() ? "none" : "polar";
}

export function isBillingEnabled(): boolean {
  return getBillingDriver() !== "none";
}

/** Cloud defaults to both providers; an explicit driver enables only itself. */
export function isBillingProviderEnabled(provider: BillingProvider): boolean {
  if (!env.REQUO_BILLING_DRIVER && isCloudDeployment()) {
    return true;
  }

  return getBillingDriver() === provider;
}

export function getEntitlementPolicy(): EntitlementPolicy {
  return isBillingEnabled() ? "plans" : "full";
}

/**
 * Resolve the plan a read path should expose for a stored Cloud plan.
 *
 * Self-hosted installs deliberately never write a plan assignment, so the
 * `businesses.plan` column keeps its `"free"` default. Reads that render
 * plan-dependent settings or UI must use this helper instead of the raw
 * column.
 */
export function resolveDeploymentPlan(plan: PlanTier): PlanTier {
  return getEntitlementPolicy() === "full" ? selfHostedEntitlementPlan : plan;
}
