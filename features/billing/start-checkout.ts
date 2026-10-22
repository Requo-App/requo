"use client";

import type { BillingInterval, PaidPlan } from "@/lib/billing/types";

/**
 * Posts to `/api/billing/checkout` to create a Polar hosted
 * checkout session, then opens the hosted checkout URL in a new
 * browser tab.
 *
 * A fresh checkout session is created on every call — we never reuse
 * a prior link. Hosted checkout sessions are ephemeral by design and
 * caching them invites bugs around expiration and stale plan choices.
 *
 * Why open synchronously: browsers only honor `window.open` calls
 * that happen inside the original user-gesture chain. We open
 * `about:blank` immediately on click, then navigate that tab once the
 * API returns the URL. If the popup is blocked (the open call
 * returned `null`), we fall back to a same-tab redirect.
 *
 * Returns a structured result on failure so callers can render a
 * toast or inline error. Never throws on an HTTP error — only on
 * unexpected runtime failures inside the caller's environment.
 */

export type StartCheckoutParams = {
  businessId: string;
  plan: PaidPlan;
  interval: BillingInterval;
  /**
   * Same-origin path the user should land on after returning from
   * Polar's hosted checkout. Default behavior (no value sent) routes
   * them to the businesses hub. Inside a business, pass the dashboard
   * path so the user lands back where they were.
   */
  returnTo?: string;
};

export type StartCheckoutResult =
  | { ok: true; openedInNewTab: boolean }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "already_subscribed"
        | "not_configured"
        | "bad_request"
        | "provider_error"
        | "network_error";
      message: string;
      status?: number;
    };

const DEFAULT_ERROR_MESSAGE =
  "We couldn't start checkout. Please try again in a moment.";

function reasonForStatus(
  status: number,
): Extract<StartCheckoutResult, { ok: false }>["reason"] {
  switch (status) {
    case 401:
      return "unauthorized";
    case 409:
      return "already_subscribed";
    case 503:
      return "not_configured";
    case 400:
      return "bad_request";
    default:
      return "provider_error";
  }
}

function openBlankTab(): Window | null {
  if (typeof window === "undefined") return null;
  // `noopener` cannot be set here because that would null out the
  // returned reference and we need to navigate the tab ourselves.
  // We strip `opener` manually after opening (see below).
  return window.open("about:blank", "_blank");
}

function navigateNewTab(target: Window, url: string): void {
  // Cut the back-reference to this window before navigating
  // cross-origin. Once the new tab is on the Polar domain, the
  // browser's cross-origin protections take over.
  try {
    target.opener = null;
  } catch {
    // Some browsers throw on assignment; ignore — cross-origin
    // navigation will isolate the tab anyway.
  }
  // `replace` keeps the about:blank entry out of history so the user
  // pressing Back from Polar doesn't land on a blank page.
  target.location.replace(url);
}

export async function startPolarCheckout(
  params: StartCheckoutParams,
): Promise<StartCheckoutResult> {
  const newTab = openBlankTab();

  let response: Response;
  try {
    response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        businessId: params.businessId,
        plan: params.plan,
        interval: params.interval,
        ...(params.returnTo ? { returnTo: params.returnTo } : {}),
      }),
    });
  } catch {
    newTab?.close();
    return {
      ok: false,
      reason: "network_error",
      message:
        "We couldn't reach the server. Check your connection and try again.",
    };
  }

  let payload: { checkoutUrl?: string; error?: string } = {};
  try {
    payload = (await response.json()) as {
      checkoutUrl?: string;
      error?: string;
    };
  } catch {
    payload = {};
  }

  if (!response.ok) {
    newTab?.close();
    return {
      ok: false,
      reason: reasonForStatus(response.status),
      status: response.status,
      message: payload.error ?? DEFAULT_ERROR_MESSAGE,
    };
  }

  if (!payload.checkoutUrl) {
    newTab?.close();
    return {
      ok: false,
      reason: "provider_error",
      message: "Checkout URL was missing from the response.",
    };
  }

  // If the checkout URL is same-origin (upgrade via subscription update,
  // no Polar hosted checkout needed), open in new tab like normal checkouts.
  const isSameOrigin =
    payload.checkoutUrl.startsWith("/") ||
    payload.checkoutUrl.startsWith(window.location.origin);

  if (isSameOrigin) {
    if (newTab) {
      navigateNewTab(newTab, payload.checkoutUrl);
      return { ok: true, openedInNewTab: true };
    }
    window.location.assign(payload.checkoutUrl);
    return { ok: true, openedInNewTab: false };
  }

  if (newTab) {
    navigateNewTab(newTab, payload.checkoutUrl);
    return { ok: true, openedInNewTab: true };
  }

  // Popup blocker prevented the new-tab open — fall back to a same-tab
  // redirect so the flow still completes.
  window.location.assign(payload.checkoutUrl);
  return { ok: true, openedInNewTab: false };
}
