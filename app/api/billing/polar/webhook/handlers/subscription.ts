import "server-only";

/**
 * Polar subscription event handlers.
 *
 * The `@polar-sh/nextjs` `Webhooks` adapter dispatches verified payloads
 * to per-event handlers. This module exports one handler per
 * `subscription.*` event we react to — each wraps its body with the
 * shared `withIdempotency` helper so duplicate deliveries deduplicate
 * cleanly through `billing_events`.
 *
 * Status mapping (Polar -> Requo `SubscriptionStatus`):
 *
 * | Polar status            | Requo                                          |
 * | ----------------------- | ---------------------------------------------- |
 * | active                  | active                                         |
 * | past_due                | past_due (7-day local grace window)            |
 * | paused                  | paused                                         |
 * | canceled (period > now) | canceled                                       |
 * | canceled (period <= now)| expired                                        |
 * | revoked / unpaid /      | expired                                        |
 * |   incomplete_expired    |                                                |
 * | incomplete / trialing   | incomplete                                     |
 *
 * Plan and interval are recovered from the Polar product id via
 * `reversePolarProductId`. If the lookup fails for an event that needs
 * to write subscription state (`subscription.created/active/updated`),
 * the handler throws so the event is marked `failed` and Polar retries
 * (Requirement 7.7).
 *
 * Customer + subscription identifiers are read from the typed payload:
 * `data.customer.id` (Polar customer id) and `data.id` (Polar
 * subscription id).
 */

import type { models, webhooks } from "@polar-sh/sdk/2026-10";

import { normalizeBillingCurrency } from "@/lib/billing/currency";
import {
  getPolarProductIds,
  reversePolarProductId,
} from "@/lib/billing/polar-products";
import {
  activateSubscription,
  expireSubscription,
  updateSubscriptionStatus,
} from "@/lib/billing/subscription-service";
import type { PlanTier } from "@/lib/plans/plans";

import { resolvePolarBusinessId } from "../identity";
import { withIdempotency } from "../idempotency";

/* ── Plan resolution ──────────────────────────────────────────────────────── */

/**
 * Resolves `(plan, interval)` for the Polar product id on a
 * subscription payload. Throws when the product id has no mapping —
 * this surfaces missing env configuration to operators (Requirement
 * 7.7) by failing the event so Polar retries.
 */
function resolvePlanFromPayload(data: models.Subscription): {
  plan: PlanTier;
} {
  const mapping = reversePolarProductId(data.product_id, getPolarProductIds());

  if (!mapping) {
    throw new Error(`Unknown Polar product id: ${data.product_id}`);
  }

  return { plan: mapping.plan };
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readEventAt(timestamp: string): Date | null {
  return toDate(timestamp);
}

/* ── Handlers ─────────────────────────────────────────────────────────────── */

/**
 * Handles `subscription.created`. Polar fires this when a new
 * subscription record is created — `status` may not be `active` yet
 * if the first payment is still processing. We route through the
 * shared status mapping below so the resulting Requo status reflects
 * whatever Polar reports.
 */
export async function handleSubscriptionCreated(
  payload: webhooks.WebhookSubscriptionCreatedPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.created",
    resolvePolarBusinessId,
    async (businessId) => {
      await applySubscriptionState(
        businessId,
        payload.data,
        readEventAt(payload.timestamp),
      );
    },
  );
}

/**
 * Handles `subscription.active`. Always activates the subscription on
 * the Requo side — Polar only fires this when the subscription has
 * become active (initial paid charge or recovered payment).
 */
export async function handleSubscriptionActive(
  payload: webhooks.WebhookSubscriptionActivePayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.active",
    resolvePolarBusinessId,
    async (businessId) => {
      const { plan } = resolvePlanFromPayload(payload.data);
      await activateForPayload(
        businessId,
        plan,
        payload.data,
        readEventAt(payload.timestamp),
      );
    },
  );
}

/**
 * Handles `subscription.updated`. Polar fires this for every change to
 * a subscription, including renewals, cancellations, past-due
 * transitions, pausing, and revocations. The handler maps the Polar
 * status to a Requo status per the design table.
 */
export async function handleSubscriptionUpdated(
  payload: webhooks.WebhookSubscriptionUpdatedPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.updated",
    resolvePolarBusinessId,
    async (businessId) => {
      await applySubscriptionState(
        businessId,
        payload.data,
        readEventAt(payload.timestamp),
      );
    },
  );
}

/**
 * Handles `subscription.canceled`. The user keeps paid access until
 * `currentPeriodEnd`; the Requo row flips to `canceled` with
 * `canceledAt` set, matching the Polar timestamp where available.
 */
export async function handleSubscriptionCanceled(
  payload: webhooks.WebhookSubscriptionCanceledPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.canceled",
    resolvePolarBusinessId,
    async (businessId) => {
      const data = payload.data;
      const periodEnd = toDate(data.current_period_end);
      const eventAt = readEventAt(payload.timestamp);

      if (periodEnd && periodEnd.getTime() > Date.now()) {
        await updateSubscriptionStatus(businessId, "canceled", {
          canceledAt: toDate(data.canceled_at) ?? new Date(),
          currentPeriodStart: toDate(data.current_period_start),
          currentPeriodEnd: periodEnd,
          providerCustomerId: data.customer.id,
          providerSubscriptionId: data.id,
          providerEventAt: eventAt,
        });
      } else {
        await expireSubscription(businessId, eventAt);
      }
    },
  );
}

/**
 * Handles `subscription.uncanceled`. Polar fires this when a customer
 * revokes a pending cancellation during the grace window. We restore
 * `status: "active"` and clear `canceledAt` (the writer in
 * `subscription-service.ts` already nulls it on activation).
 */
export async function handleSubscriptionUncanceled(
  payload: webhooks.WebhookSubscriptionUncanceledPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.uncanceled",
    resolvePolarBusinessId,
    async (businessId) => {
      const { plan } = resolvePlanFromPayload(payload.data);
      await activateForPayload(
        businessId,
        plan,
        payload.data,
        readEventAt(payload.timestamp),
      );
    },
  );
}

/**
 * Handles `subscription.revoked`. Polar fires this when the customer
 * loses access immediately — payment retries exhausted or explicit
 * revocation. Maps to Requo `expired`.
 */
export async function handleSubscriptionRevoked(
  payload: webhooks.WebhookSubscriptionRevokedPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.revoked",
    resolvePolarBusinessId,
    async (businessId) => {
      await expireSubscription(
        businessId,
        readEventAt(payload.timestamp),
      );
    },
  );
}

/**
 * Handles `subscription.past_due`. This event type must be wired
 * explicitly: the generic `subscription.updated` path does not cover it
 * in the adapter, and ignoring it would leave paid access granted
 * forever after a failed renewal.
 */
export async function handleSubscriptionPastDue(
  payload: webhooks.WebhookSubscriptionPastDuePayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.past_due",
    resolvePolarBusinessId,
    async (businessId) => {
      await applySubscriptionState(
        businessId,
        payload.data,
        readEventAt(payload.timestamp),
      );
    },
  );
}

/**
 * Handles `subscription.paused`. Paused subscriptions do not grant paid
 * access until they resume.
 */
export async function handleSubscriptionPaused(
  payload: webhooks.WebhookSubscriptionPausedPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.paused",
    resolvePolarBusinessId,
    async (businessId) => {
      const data = payload.data;
      await updateSubscriptionStatus(businessId, "paused", {
        currentPeriodStart: toDate(data.current_period_start),
        currentPeriodEnd: toDate(data.current_period_end),
        providerCustomerId: data.customer.id,
        providerSubscriptionId: data.id,
        providerEventAt: readEventAt(payload.timestamp),
      });
    },
  );
}

/**
 * Handles `subscription.resumed`. A previously paused subscription
 * regains paid access.
 */
export async function handleSubscriptionResumed(
  payload: webhooks.WebhookSubscriptionResumedPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.resumed",
    resolvePolarBusinessId,
    async (businessId) => {
      const { plan } = resolvePlanFromPayload(payload.data);
      await activateForPayload(
        businessId,
        plan,
        payload.data,
        readEventAt(payload.timestamp),
      );
    },
  );
}

/**
 * Handles `subscription.cycled`. Polar fires this when a subscription
 * enters a new billing period; refresh the period boundaries and keep
 * paid access active.
 */
export async function handleSubscriptionCycled(
  payload: webhooks.WebhookSubscriptionCycledPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.cycled",
    resolvePolarBusinessId,
    async (businessId) => {
      const { plan } = resolvePlanFromPayload(payload.data);
      await activateForPayload(
        businessId,
        plan,
        payload.data,
        readEventAt(payload.timestamp),
      );
    },
  );
}

/* ── Internal helpers ─────────────────────────────────────────────────────── */

/**
 * Routes a Polar `Subscription` payload to the correct
 * `subscription-service` writer based on the Polar status. Used by
 * `subscription.created` and `subscription.updated`, where the same
 * mapping table applies.
 */
async function applySubscriptionState(
  businessId: string,
  data: models.Subscription,
  eventAt: Date | null,
): Promise<void> {
  const status = String(data.status);

  switch (status) {
    case "active": {
      const { plan } = resolvePlanFromPayload(data);
      await activateForPayload(businessId, plan, data, eventAt);
      return;
    }

    case "past_due": {
      await updateSubscriptionStatus(businessId, "past_due", {
        currentPeriodStart: toDate(data.current_period_start),
        currentPeriodEnd: toDate(data.current_period_end),
        providerCustomerId: data.customer.id,
        providerSubscriptionId: data.id,
        providerEventAt: eventAt,
      });
      return;
    }

    case "paused": {
      await updateSubscriptionStatus(businessId, "paused", {
        currentPeriodStart: toDate(data.current_period_start),
        currentPeriodEnd: toDate(data.current_period_end),
        providerCustomerId: data.customer.id,
        providerSubscriptionId: data.id,
        providerEventAt: eventAt,
      });
      return;
    }

    case "canceled": {
      const periodEnd = toDate(data.current_period_end);
      const stillInPeriod = periodEnd && periodEnd.getTime() > Date.now();

      if (stillInPeriod) {
        await updateSubscriptionStatus(businessId, "canceled", {
          canceledAt: toDate(data.canceled_at) ?? new Date(),
          currentPeriodStart: toDate(data.current_period_start),
          currentPeriodEnd: periodEnd,
          providerCustomerId: data.customer.id,
          providerSubscriptionId: data.id,
          providerEventAt: eventAt,
        });
      } else {
        await expireSubscription(businessId, eventAt);
      }
      return;
    }

    case "unpaid":
    case "incomplete_expired": {
      await expireSubscription(businessId, eventAt);
      return;
    }

    case "incomplete":
    case "trialing": {
      await updateSubscriptionStatus(businessId, "incomplete", {
        currentPeriodStart: toDate(data.current_period_start),
        currentPeriodEnd: toDate(data.current_period_end),
        providerCustomerId: data.customer.id,
        providerSubscriptionId: data.id,
        providerEventAt: eventAt,
      });
      return;
    }

    default: {
      // Unknown Polar status — surface to operators by failing the
      // event so Polar retries and the issue is visible in
      // billing_events.
      throw new Error(`Unhandled Polar subscription status: ${status}`);
    }
  }
}

/**
 * Activates a Requo subscription from a Polar payload. The payload's
 * lowercase ISO currency is normalized to Requo's uppercase enum.
 */
async function activateForPayload(
  businessId: string,
  plan: PlanTier,
  data: models.Subscription,
  eventAt: Date | null,
): Promise<void> {
  await activateSubscription({
    businessId,
    plan,
    provider: "polar",
    currency: normalizeBillingCurrency(data.currency),
    status: "active",
    providerCustomerId: data.customer.id,
    providerSubscriptionId: data.id,
    providerCheckoutId: data.checkout_id ?? null,
    currentPeriodStart: toDate(data.current_period_start),
    currentPeriodEnd: toDate(data.current_period_end),
    providerEventAt: eventAt,
  });
}