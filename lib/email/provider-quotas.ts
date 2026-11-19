import "server-only";

import { cacheLayer } from "@/lib/ai/cache-layer";
import {
  env,
  isBrevoConfigured,
  isMailtrapConfigured,
  isResendConfigured,
  isSmtpConfigured,
} from "@/lib/env";
import { EMAIL_PROVIDER_TIMEOUT_MS } from "@/lib/email/providers/utils";

export type EmailQuotaStatus = "ok" | "unavailable" | "error";

export type EmailProviderQuota = {
  provider: "resend" | "mailtrap" | "brevo" | "smtp";
  label: string;
  configured: boolean;
  dailyUsed: number | null;
  dailyLimit: number | null;
  monthlyUsed: number | null;
  monthlyLimit: number | null;
  resetsAt: string | null;
  status: EmailQuotaStatus;
  message: string | null;
};

const QUOTA_CACHE_KEY = "admin:email-quotas:v2";
const QUOTA_CACHE_TTL_SECONDS = 300;

function unavailable(
  provider: EmailProviderQuota["provider"],
  label: string,
  message: string,
): EmailProviderQuota {
  return {
    provider,
    label,
    configured: false,
    dailyUsed: null,
    dailyLimit: null,
    monthlyUsed: null,
    monthlyLimit: null,
    resetsAt: null,
    status: "unavailable",
    message,
  };
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getResendQuota(): Promise<EmailProviderQuota> {
  if (!isResendConfigured || !env.RESEND_API_KEY) {
    return unavailable("resend", "Resend", "Missing keys");
  }
  try {
    const response = await fetch("https://api.resend.com/usage", {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(EMAIL_PROVIDER_TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 403) {
      return {
        provider: "resend",
        label: "Resend",
        configured: true,
        dailyUsed: null,
        dailyLimit: null,
        monthlyUsed: null,
        monthlyLimit: null,
        resetsAt: null,
        status: "unavailable",
        message: "Usage API not enabled for this key",
      };
    }
    if (!response.ok) {
      return {
        provider: "resend",
        label: "Resend",
        configured: true,
        dailyUsed: null,
        dailyLimit: null,
        monthlyUsed: null,
        monthlyLimit: null,
        resetsAt: null,
        status: "error",
        message: `HTTP ${response.status}`,
      };
    }
    const data = (await response.json()) as {
      emails?: {
        daily?: { used?: number; limit?: number | null; resets_at?: string };
        monthly?: { used?: number; limit?: number | null; resets_at?: string };
      };
    };
    return {
      provider: "resend",
      label: "Resend",
      configured: true,
      dailyUsed: toFiniteNumber(data.emails?.daily?.used),
      dailyLimit: toFiniteNumber(data.emails?.daily?.limit),
      monthlyUsed: toFiniteNumber(data.emails?.monthly?.used),
      monthlyLimit: toFiniteNumber(data.emails?.monthly?.limit),
      resetsAt: data.emails?.monthly?.resets_at ?? data.emails?.daily?.resets_at ?? null,
      status: "ok",
      message: null,
    };
  } catch (error) {
    return {
      provider: "resend",
      label: "Resend",
      configured: true,
      dailyUsed: null,
      dailyLimit: null,
      monthlyUsed: null,
      monthlyLimit: null,
      resetsAt: null,
      status: "error",
      message: error instanceof Error ? error.message.split("\n")[0] : "Request failed",
    };
  }
}

async function getBrevoQuota(): Promise<EmailProviderQuota> {
  if (!isBrevoConfigured || !env.BREVO_API_KEY) {
    return unavailable("brevo", "Brevo", "Missing keys");
  }
  try {
    const response = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": env.BREVO_API_KEY, accept: "application/json" },
      signal: AbortSignal.timeout(EMAIL_PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        provider: "brevo",
        label: "Brevo",
        configured: true,
        dailyUsed: null,
        dailyLimit: null,
        monthlyUsed: null,
        monthlyLimit: null,
        resetsAt: null,
        status: response.status === 401 || response.status === 403 ? "unavailable" : "error",
        message: `HTTP ${response.status}`,
      };
    }
    const data = (await response.json()) as {
      plan?: Array<{ credits?: number; creditsType?: string; type?: string }>;
    };
    const sendPlan = data.plan?.find((p) => p.creditsType === "sendLimit");
    const remaining = toFiniteNumber(sendPlan?.credits);
    return {
      provider: "brevo",
      label: "Brevo",
      configured: true,
      dailyUsed: null,
      dailyLimit: null,
      monthlyUsed: null,
      monthlyLimit: remaining,
      resetsAt: null,
      status: "ok",
      message:
        remaining !== null
          ? `${remaining.toLocaleString("en-US")} credits remaining (${sendPlan?.type ?? "plan"})`
          : "No send-limit plan returned",
    };
  } catch (error) {
    return {
      provider: "brevo",
      label: "Brevo",
      configured: true,
      dailyUsed: null,
      dailyLimit: null,
      monthlyUsed: null,
      monthlyLimit: null,
      resetsAt: null,
      status: "error",
      message: error instanceof Error ? error.message.split("\n")[0] : "Request failed",
    };
  }
}

async function getMailtrapQuota(): Promise<EmailProviderQuota> {
  if (!isMailtrapConfigured || !env.MAILTRAP_API_TOKEN) {
    return unavailable("mailtrap", "Mailtrap", "Missing keys");
  }
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      Authorization: `Bearer ${env.MAILTRAP_API_TOKEN}`,
      "Api-Token": env.MAILTRAP_API_TOKEN,
    };
    const response = await fetch("https://mailtrap.io/api/billing/usage", {
      headers,
      signal: AbortSignal.timeout(EMAIL_PROVIDER_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      return {
        provider: "mailtrap",
        label: "Mailtrap",
        configured: true,
        dailyUsed: null,
        dailyLimit: null,
        monthlyUsed: null,
        monthlyLimit: null,
        resetsAt: null,
        status: "unavailable",
        message: "Sending token lacks billing scope",
      };
    }
    if (!response.ok) {
      return {
        provider: "mailtrap",
        label: "Mailtrap",
        configured: true,
        dailyUsed: null,
        dailyLimit: null,
        monthlyUsed: null,
        monthlyLimit: null,
        resetsAt: null,
        status: "error",
        message: `HTTP ${response.status}`,
      };
    }
    const data = (await response.json()) as {
      billing?: { cycle_end?: string };
      sending?: {
        plan?: { name?: string };
        usage?: { sent_messages_count?: { current?: number; limit?: number } };
      };
    };
    const current = toFiniteNumber(data.sending?.usage?.sent_messages_count?.current);
    const limit = toFiniteNumber(data.sending?.usage?.sent_messages_count?.limit);
    return {
      provider: "mailtrap",
      label: "Mailtrap",
      configured: true,
      dailyUsed: null,
      dailyLimit: null,
      monthlyUsed: current,
      monthlyLimit: limit,
      resetsAt: data.billing?.cycle_end ?? null,
      status: "ok",
      message: data.sending?.plan?.name ?? null,
    };
  } catch (error) {
    return {
      provider: "mailtrap",
      label: "Mailtrap",
      configured: true,
      dailyUsed: null,
      dailyLimit: null,
      monthlyUsed: null,
      monthlyLimit: null,
      resetsAt: null,
      status: "error",
      message: error instanceof Error ? error.message.split("\n")[0] : "Request failed",
    };
  }
}

function getSmtpConfiguration(): EmailProviderQuota {
  return {
    provider: "smtp",
    label: "SMTP",
    configured: isSmtpConfigured,
    dailyUsed: null,
    dailyLimit: null,
    monthlyUsed: null,
    monthlyLimit: null,
    resetsAt: null,
    status: "ok",
    message: isSmtpConfigured
      ? "Usage limits are managed by the SMTP service."
      : "SMTP relay is not configured.",
  };
}

/**
 * Live provider quotas, cached 5 minutes and fail-soft.
 *
 * API-provider order matches the send fallback chain (Resend → Mailtrap → Brevo).
 * SMTP has no quota API, so it reports configuration only.
 * Never throws — every provider maps failures to a status row.
 */
export async function getEmailProviderQuotas(): Promise<EmailProviderQuota[]> {
  const cached = await cacheLayer.get<EmailProviderQuota[]>(QUOTA_CACHE_KEY);
  if (cached) return cached;

  const quotas = await Promise.all([
    getResendQuota(),
    getMailtrapQuota(),
    getBrevoQuota(),
    getSmtpConfiguration(),
  ]);
  await cacheLayer.set(QUOTA_CACHE_KEY, quotas, QUOTA_CACHE_TTL_SECONDS);
  return quotas;
}
