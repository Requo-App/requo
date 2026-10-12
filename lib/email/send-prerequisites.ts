import "server-only";

import {
  getBusinessMessagingSettings,
  getBusinessOwnerEmails,
} from "@/lib/db/business-access";
import { isEmailConfigured } from "@/lib/env";
import { checkUsageAllowance } from "@/lib/plans/usage";
import type { BusinessPlan } from "@/lib/plans/plans";
import type { UsageLimitKey } from "@/lib/plans/usage-limits";
import { getResendFromEmailConfigurationError } from "@/lib/email/transactional";

/**
 * Requo-delivery preconditions shared by quote and invoice sending.
 *
 * Three small gates mirroring the order both actions already use: quota
 * pair first, then messaging context, then sender configuration. Manual
 * delivery skips the quota and configuration gates but still loads the
 * messaging context, so each gate stays independently callable.
 *
 * Quota keys are explicit per call site and intentionally untouched —
 * invoices currently share the `requoQuoteEmails*` pool with quotes
 * (see the billing-policy question in the Task 32 report).
 */

export async function checkDocumentSendQuota(input: {
  businessId: string;
  plan: BusinessPlan;
  dailyKey: UsageLimitKey;
  monthlyKey: UsageLimitKey;
}): Promise<boolean> {
  const [dailyAllowance, monthlyAllowance] = await Promise.all([
    checkUsageAllowance(input.businessId, input.plan, input.dailyKey),
    checkUsageAllowance(input.businessId, input.plan, input.monthlyKey),
  ]);

  return dailyAllowance.allowed && monthlyAllowance.allowed;
}

export type DocumentMessagingContext = {
  settings: NonNullable<
    Awaited<ReturnType<typeof getBusinessMessagingSettings>>
  >;
  ownerEmails: string[];
};

export async function loadDocumentMessagingContext(
  businessId: string,
): Promise<DocumentMessagingContext | null> {
  const businessSettings = await getBusinessMessagingSettings(businessId);

  if (!businessSettings) {
    return null;
  }

  const ownerEmails = await getBusinessOwnerEmails(businessId);

  return { settings: businessSettings, ownerEmails };
}

/** Sender configuration gate for Requo delivery; null when sending may proceed. */
export function checkDocumentSendConfiguration(
  unconfiguredError: string,
): string | null {
  if (!isEmailConfigured) {
    return unconfiguredError;
  }

  return getResendFromEmailConfigurationError() ?? null;
}
