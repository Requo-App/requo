import "server-only";

/**
 * Minimal PayMongo API client for QR Ph hosted checkout.
 *
 * Only the two calls this integration needs are implemented:
 *
 *   - `POST /v2/checkout_sessions` creates a hosted checkout session.
 *   - `GET  /v1/checkout_sessions/{id}` reads it back for the success-page
 *     fallback when the webhook has not arrived yet.
 *
 * Authentication is HTTP Basic with the secret key as the username and an
 * empty password. The secret key never leaves the server.
 */

import { env } from "@/lib/env";

const PAYMONGO_API_BASE_URL = "https://api.paymongo.com";
const PAYMONGO_REQUEST_TIMEOUT_MS = 15_000;

export type PaymongoCheckoutPayment = {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  paidAt: Date | null;
};

export type PaymongoCheckoutSession = {
  id: string;
  checkoutUrl: string | null;
  status: string | null;
  livemode: boolean | null;
  referenceNumber: string | null;
  metadata: Record<string, string>;
  paymentMethodUsed: string | null;
  payments: PaymongoCheckoutPayment[];
};

type PaymongoResource = {
  id?: unknown;
  type?: unknown;
  attributes?: Record<string, unknown>;
};

type PaymongoEnvelope = {
  data?: PaymongoResource;
  errors?: Array<{ detail?: unknown; code?: unknown }>;
};

export class PaymongoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PaymongoApiError";
  }
}

function getSecretKey(): string {
  const key = env.PAYMONGO_SECRET_KEY;

  if (!key) {
    throw new Error("PayMongo is not configured.");
  }

  return key;
}

function authorizationHeader(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readDateFromUnixSeconds(value: unknown): Date | null {
  const seconds = readNumber(value);

  if (seconds === null) return null;

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const metadata: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      metadata[key] = entry;
    }
  }

  return metadata;
}

function toCheckoutSession(resource: PaymongoResource | undefined): PaymongoCheckoutSession {
  if (!resource || typeof resource.id !== "string" || !resource.id) {
    throw new PaymongoApiError("PayMongo returned an invalid checkout session.", 502);
  }

  const attributes = resource.attributes ?? {};
  const payments = Array.isArray(attributes.payments)
    ? attributes.payments
        .map((payment): PaymongoCheckoutPayment | null => {
          if (!payment || typeof payment !== "object") return null;

          const entry = payment as PaymongoResource;
          const paymentAttributes = entry.attributes ?? {};

          if (typeof entry.id !== "string" || !entry.id) return null;

          return {
            id: entry.id,
            amount: readNumber(paymentAttributes.amount),
            currency: readString(paymentAttributes.currency),
            status: readString(paymentAttributes.status),
            paidAt: readDateFromUnixSeconds(paymentAttributes.paid_at),
          };
        })
        .filter((payment): payment is PaymongoCheckoutPayment => payment !== null)
    : [];

  return {
    id: resource.id,
    checkoutUrl: readString(attributes.checkout_url),
    status: readString(attributes.status),
    livemode: readBoolean(attributes.livemode),
    referenceNumber: readString(attributes.reference_number),
    metadata: readMetadata(attributes.metadata),
    paymentMethodUsed: readString(attributes.payment_method_used),
    payments,
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as PaymongoEnvelope;
    const detail = payload.errors?.[0]?.detail;

    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }
  } catch {
    // Non-JSON error body (including the plain-text 429 response).
  }

  return `PayMongo request failed with status ${response.status}.`;
}

export type CreatePaymongoCheckoutSessionInput = {
  /** Internal intent id, sent as the reference number and idempotency key. */
  intentId: string;
  description: string;
  amount: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
};

/**
 * Creates a QR Ph hosted checkout session. Returns the session id and the URL
 * the browser must be sent to.
 */
export async function createPaymongoCheckoutSession(
  input: CreatePaymongoCheckoutSessionInput,
): Promise<PaymongoCheckoutSession> {
  const secretKey = getSecretKey();

  let response: Response;

  try {
    response = await fetch(`${PAYMONGO_API_BASE_URL}/v2/checkout_sessions`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader(secretKey),
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": input.intentId,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: input.description,
                amount: input.amount,
                currency: "PHP",
                quantity: 1,
              },
            ],
            payment_method_types: ["qrph"],
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            reference_number: input.intentId,
            customer_email: input.customerEmail,
            metadata: input.metadata,
          },
        },
      }),
      signal: AbortSignal.timeout(PAYMONGO_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PaymongoApiError(
      error instanceof Error
        ? `PayMongo request failed: ${error.message}`
        : "PayMongo request failed.",
      502,
    );
  }

  if (!response.ok) {
    throw new PaymongoApiError(
      await readErrorMessage(response),
      response.status,
    );
  }

  const payload = (await response.json()) as PaymongoEnvelope;
  const session = toCheckoutSession(payload.data);

  if (!session.checkoutUrl) {
    throw new PaymongoApiError(
      "PayMongo did not return a checkout URL.",
      502,
    );
  }

  return session;
}

/** Reads a checkout session after the customer returns from PayMongo. */
export async function retrievePaymongoCheckoutSession(
  sessionId: string,
): Promise<PaymongoCheckoutSession> {
  const secretKey = getSecretKey();

  let response: Response;

  try {
    response = await fetch(
      `${PAYMONGO_API_BASE_URL}/v1/checkout_sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        headers: {
          Authorization: authorizationHeader(secretKey),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(PAYMONGO_REQUEST_TIMEOUT_MS),
      },
    );
  } catch (error) {
    throw new PaymongoApiError(
      error instanceof Error
        ? `PayMongo request failed: ${error.message}`
        : "PayMongo request failed.",
      502,
    );
  }

  if (!response.ok) {
    throw new PaymongoApiError(
      await readErrorMessage(response),
      response.status,
    );
  }

  const payload = (await response.json()) as PaymongoEnvelope;
  return toCheckoutSession(payload.data);
}

/** The first successful payment on a checkout session, if any. */
export function getPaidCheckoutPayment(
  session: PaymongoCheckoutSession,
): PaymongoCheckoutPayment | null {
  return session.payments.find((payment) => payment.status === "paid") ?? null;
}
