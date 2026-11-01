import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  activatePaymongoCheckoutIntent,
  resolvePaymongoCheckoutIntent,
} from "@/lib/billing/paymongo-checkout";
import { verifyPaymongoSignature } from "@/lib/billing/paymongo-signature";
import {
  markEventFailed,
  markEventIgnored,
  markEventProcessed,
  recordWebhookEvent,
} from "@/lib/billing/webhook-processor";
import { env, getPaymongoMode, isPaymongoConfigured } from "@/lib/env";
import { logError, logWarn } from "@/lib/observability/logger";

/**
 * PayMongo QR Ph webhook.
 *
 * PayMongo signs the raw request body. The signature is verified before the
 * JSON is parsed, and test/live mode is enforced from the secret-key prefix so
 * a test event can never activate a live prepaid term.
 *
 * Only `checkout_session.payment.paid` mutates subscription state. Every other
 * event is recorded in `billing_events` with status `ignored` for audit.
 *
 * Idempotency uses the PayMongo event id, which is stable across the gateway's
 * retries. Activation is additionally idempotent per checkout intent, so the
 * success-page eager sync and this webhook can race safely.
 */

type PaymongoEventResource = {
  id?: unknown;
  type?: unknown;
  attributes?: Record<string, unknown>;
};

type PaymongoEvent = {
  data?: PaymongoEventResource;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readDateFromUnixSeconds(value: unknown): Date | null {
  const seconds = readNumber(value);

  if (seconds === null) return null;

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readPaidPayment(
  session: PaymongoEventResource,
): { id: string; amount: number | null; currency: string | null; paidAt: Date | null } | null {
  const payments = session.attributes?.payments;

  if (!Array.isArray(payments)) {
    return null;
  }

  for (const entry of payments) {
    if (!entry || typeof entry !== "object") continue;

    const payment = entry as PaymongoEventResource;
    const attributes = payment.attributes ?? {};

    if (readString(attributes.status) !== "paid") continue;

    const id = readString(payment.id);
    if (!id) continue;

    return {
      id,
      amount: readNumber(attributes.amount),
      currency: readString(attributes.currency),
      paidAt: readDateFromUnixSeconds(attributes.paid_at),
    };
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  if (!isPaymongoConfigured) {
    return NextResponse.json(
      { error: "PayMongo is not configured." },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const mode = getPaymongoMode();
  const secret = env.PAYMONGO_WEBHOOK_SECRET;

  if (!mode || !secret) {
    return NextResponse.json(
      { error: "PayMongo is not configured." },
      { status: 503 },
    );
  }

  const verified = verifyPaymongoSignature({
    rawBody,
    signatureHeader: request.headers.get("paymongo-signature"),
    secret,
    mode,
  });

  if (!verified) {
    logWarn("paymongo.webhook.signature_invalid", {});
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: PaymongoEvent;

  try {
    event = JSON.parse(rawBody) as PaymongoEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const eventResource = event.data;
  const eventAttributes = eventResource?.attributes ?? {};
  const paymentEventType = readString(eventAttributes.type);
  const eventId = readString(eventResource?.id) ?? randomUUID();
  const eventCreatedAt = readDateFromUnixSeconds(eventAttributes.created_at);
  const livemode =
    typeof eventAttributes.livemode === "boolean"
      ? eventAttributes.livemode
      : null;

  // A test delivery against a live key (or the reverse) is a configuration
  // error, not a transient failure. Acknowledge it so PayMongo stops retrying
  // and leave a log line for operators.
  if (livemode !== null && livemode !== (mode === "live")) {
    logError("paymongo.webhook.livemode_mismatch", new Error("PayMongo livemode mismatch"), {
      eventId,
      eventType: paymentEventType,
      livemode,
      mode,
    });

    return NextResponse.json({ received: true, ignored: true });
  }

  if (paymentEventType !== "checkout_session.payment.paid") {
    await recordEvent({
      eventId,
      eventType: paymentEventType ?? "unknown",
      payload: event,
      status: "ignored",
    });

    return NextResponse.json({ received: true, ignored: true });
  }

  const session = eventAttributes.data as PaymongoEventResource | undefined;
  const sessionId = readString(session?.id);

  if (!sessionId) {
    return NextResponse.json({ error: "Missing checkout session." }, { status: 400 });
  }

  const intent = await resolvePaymongoCheckoutIntent({
    providerSessionId: sessionId,
    referenceNumber: readString(session?.attributes?.reference_number),
  });

  if (!intent) {
    await recordEvent({
      eventId,
      eventType: paymentEventType,
      payload: event,
      status: "failed",
      errorMessage: `No checkout intent for PayMongo session ${sessionId}.`,
    });

    logError(
      "paymongo.webhook.intent_missing",
      new Error(`No checkout intent for PayMongo session ${sessionId}.`),
      { eventId, sessionId },
    );

    // An unknown session will not resolve on retry. Acknowledge and leave the
    // failure in `billing_events` for manual reconciliation.
    return NextResponse.json({ received: true, ignored: true });
  }

  const recorded = await recordWebhookEvent({
    providerEventId: eventId,
    provider: "paymongo",
    eventType: paymentEventType,
    userId: intent.userId,
    businessId: intent.businessId,
    payload: event,
  });

  if (!recorded.claimed || !recorded.claimToken) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const paidPayment = readPaidPayment(session!);

  if (!paidPayment) {
    await markEventFailed(
      recorded.eventId,
      recorded.claimToken,
      "checkout_session.payment.paid event has no paid payment.",
    );

    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const result = await activatePaymongoCheckoutIntent({
      intentId: intent.id,
      payment: {
        providerPaymentId: paidPayment.id,
        amount: paidPayment.amount,
        currency: paidPayment.currency,
        paidAt: paidPayment.paidAt ?? eventCreatedAt,
      },
    });

    if (result.status === "activated" || result.status === "already_active") {
      await markEventProcessed(recorded.eventId, recorded.claimToken);

      return NextResponse.json({ received: true });
    }

    const message =
      result.status === "invalid_payment"
        ? result.message
        : result.status === "blocked_by_polar"
          ? result.message
          : `Intent ${intent.id} is not payable (${result.status}).`;

    await markEventFailed(recorded.eventId, recorded.claimToken, message);

    logError("paymongo.webhook.activation_failed", new Error(message), {
      eventId,
      intentId: intent.id,
      sessionId,
      status: result.status,
    });

    // Unfixable by retry — the payment needs operator reconciliation. The
    // failed `billing_events` row is the audit trail.
    return NextResponse.json({ received: true, ignored: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Activation failed.";

    await markEventFailed(recorded.eventId, recorded.claimToken, message);

    logError("paymongo.webhook.activation_error", error, {
      eventId,
      intentId: intent.id,
      sessionId,
    });

    // Return 5xx so PayMongo retries a transient database/provider failure.
    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}

async function recordEvent({
  eventId,
  eventType,
  payload,
  status,
  errorMessage,
}: {
  eventId: string;
  eventType: string;
  payload: unknown;
  status: "ignored" | "failed";
  errorMessage?: string;
}): Promise<void> {
  try {
    const result = await recordWebhookEvent({
      providerEventId: eventId,
      provider: "paymongo",
      eventType,
      payload,
    });

    if (!result.claimed || !result.claimToken) {
      return;
    }

    if (status === "ignored") {
      await markEventIgnored(result.eventId, result.claimToken);
      return;
    }

    await markEventFailed(
      result.eventId,
      result.claimToken,
      errorMessage ?? "Event could not be processed.",
    );
  } catch (error) {
    logError("paymongo.webhook.record_failed", error, {
      eventId,
      eventType,
    });
  }
}
