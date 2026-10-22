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
 * | past_due                | past_due                                       |
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

import type { WebhookSubscriptionActivePayload } from "@polar-sh/sdk/models/components/webhooksubscriptionactivepayload";
import type { WebhookSubscriptionCanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload";
import type { WebhookSubscriptionCreatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptioncreatedpayload";
import type { WebhookSubscriptionRevokedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload";
import type { WebhookSubscriptionUncanceledPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionuncanceledpayload";
import type { WebhookSubscriptionUpdatedPayload } from "@polar-sh/sdk/models/components/webhooksubscriptionupdatedpayload";
import type { Subscription } from "@polar-sh/sdk/models/components/subscription";

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
function resolvePlanFromPayload(data: Subscription): {
  plan: PlanTier;
} {
  const mapping = reversePolarProductId(data.productId, getPolarProductIds());

  if (!mapping) {
    throw new Error(`Unknown Polar product id: ${data.productId}`);
  }

  return { plan: mapping.plan };
}

/* ── Handlers ─────────────────────────────────────────────────────────────── */

/**
 * Handles `subscription.created`. Polar fires this when a new
 * subscription record is created — `status` may not be `active` yet
 * if the first payment is still processing. We route through the
 * shared `subscription.updated` mapping below so the resulting Requo
 * status reflects whatever Polar reports.
 */
export async function handleSubscriptionCreated(
  payload: WebhookSubscriptionCreatedPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.created",
    resolvePolarBusinessId,
    async (businessId) => {
      await applySubscriptionState(businessId, payload.data);
    },
  );
}

/**
 * Handles `subscription.active`. Always activates the subscription on
 * the Requo side — Polar only fires this when the subscription has
 * become active (initial paid charge or recovered payment).
 */
export async function handleSubscriptionActive(
  payload: WebhookSubscriptionActivePayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.active",
    resolvePolarBusinessId,
    async (businessId) => {
      const { plan } = resolvePlanFromPayload(payload.data);
      await activateForPayload(businessId, plan, payload.data);
    },
  );
}

/**
 * Handles `subscription.updated`. Polar fires this for every change to
 * a subscription, including renewals, cancellations, past-due
 * transitions, and revocations. The handler maps the Polar status to a
 * Requo status per the design table.
 */
export async function handleSubscriptionUpdated(
  payload: WebhookSubscriptionUpdatedPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.updated",
    resolvePolarBusinessId,
    async (businessId) => {
      await applySubscriptionState(businessId, payload.data);
    },
  );
}

/**
 * Handles `subscription.canceled`. The user keeps paid access until
 * `currentPeriodEnd`; the Requo row flips to `canceled` with
 * `canceledAt` set, matching the Polar timestamp where available.
 */
export async function handleSubscriptionCanceled(
  payload: WebhookSubscriptionCanceledPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.canceled",
    resolvePolarBusinessId,
    async (businessId) => {
      const data = payload.data;
      await updateSubscriptionStatus(businessId, "canceled", {
        canceledAt: data.canceledAt ?? new Date(),
        currentPeriodEnd: data.currentPeriodEnd,
        providerCustomerId: data.customer.id,
        providerSubscriptionId: data.id,
      });
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
  payload: WebhookSubscriptionUncanceledPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.uncanceled",
    resolvePolarBusinessId,
    async (businessId) => {
      const { plan } = resolvePlanFromPayload(payload.data);
      await activateForPayload(businessId, plan, payload.data);
    },
  );
}

/**
 * Handles `subscription.revoked`. Polar fires this when the customer
 * loses access immediately — payment retries exhausted or explicit
 * revocation. Maps to Requo `expired` and downgrades all owned
 * businesses to `free`.
 */
export async function handleSubscriptionRevoked(
  payload: WebhookSubscriptionRevokedPayload,
): Promise<void> {
  await withIdempotency(
    payload,
    "subscription.revoked",
    resolvePolarBusinessId,
    async (businessId) => {
      await expireSubscription(businessId);
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
  data: Subscription,
): Promise<void> {
  const status = String(data.status);

  switch (status) {
    case "active": {
      const { plan } = resolvePlanFromPayload(data);
      await activateForPayload(businessId, plan, data);
      return;
    }

    case "past_due": {
      await updateSubscriptionStatus(businessId, "past_due", {
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        providerCustomerId: data.customer.id,
        providerSubscriptionId: data.id,
      });
      return;
    }

    case "canceled": {
      const periodEnd = data.currentPeriodEnd;
      const stillInPeriod = periodEnd && periodEnd.getTime() > Date.now();

      if (stillInPeriod) {
        await updateSubscriptionStatus(businessId, "canceled", {
          canceledAt: data.canceledAt ?? new Date(),
          currentPeriodEnd: periodEnd,
          providerCustomerId: data.customer.id,
          providerSubscriptionId: data.id,
        });
      } else {
        await expireSubscription(businessId);
      }
      return;
    }

    case "unpaid":
    case "incomplete_expired": {
      await expireSubscription(businessId);
      return;
    }

    case "incomplete":
    case "trialing": {
      await updateSubscriptionStatus(businessId, "incomplete", {
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd,
        providerCustomerId: data.customer.id,
        providerSubscriptionId: data.id,
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
 * Activates a Requo subscription from a Polar payload. Polar settles
 * in USD, so `currency` is hard-coded; the Polar customer id /
 * subscription id and the period boundaries from the payload propagate
 * onto `account_subscriptions`.
 */
async function activateForPayload(
  businessId: string,
  plan: PlanTier,
  data: Subscription,
): Promise<void> {
  await activateSubscription({
    businessId,
    plan,
    provider: "polar",
    currency: "USD",
    status: "active",
    providerCustomerId: data.customer.id,
    providerSubscriptionId: data.id,
    currentPeriodStart: data.currentPeriodStart,
    currentPeriodEnd: data.currentPeriodEnd,
  });
}
