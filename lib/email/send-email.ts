import "server-only";

import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { emailProviders as defaultEmailProviders } from "@/lib/email/providers";
import { newEntityId } from "@/lib/ids";
import {
  classifyEmailError,
  EmailProviderError,
  EmailSendError,
  wrapEmailProviderError,
} from "@/lib/email/errors";
import {
  formatEmailAddress,
  getEmailSender,
  getEmailSenderConfigurationError,
  parseEmailAddress,
} from "@/lib/email/senders";
import type {
  EmailProvider,
  EmailProviderName,
  NormalizedSendEmailInput,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/types";
import { db } from "@/lib/db/client";
import { emailAttempts, emailOutbox } from "@/lib/db/schema";
import { ensureCorrelationId } from "@/lib/observability/correlation";
import { logInfo, logWarn } from "@/lib/observability/logger";

const STALE_SENDING_MS = 10 * 60 * 1000;
const emailAddressSchema = z.email();

type EmailOutboxRow = typeof emailOutbox.$inferSelect;

type SendEmailOptions = {
  providers?: EmailProvider[];
};

function getAddressList(value: string | string[] | undefined, label: string) {
  if (!value) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  const normalized = values.map((address) => {
    const parsed = parseEmailAddress(address);

    if (!parsed || !emailAddressSchema.safeParse(parsed.email).success) {
      throw new EmailSendError(
        `${label} contains an invalid email address.`,
        "invalid_email_address",
      );
    }

    return formatEmailAddress(parsed);
  });

  return normalized.length > 0 ? normalized : undefined;
}

function requireAddressList(value: string | string[] | undefined) {
  const addresses = getAddressList(value, "to");

  if (!addresses?.length) {
    throw new EmailSendError("Email recipient is required.", "missing_to");
  }

  return addresses;
}

function getReplyTo(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = parseEmailAddress(value);

  if (!parsed || !emailAddressSchema.safeParse(parsed.email).success) {
    throw new EmailSendError(
      "Reply-to contains an invalid email address.",
      "invalid_reply_to",
    );
  }

  return formatEmailAddress(parsed);
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return {};
  }

  return JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
}

function normalizeSendEmailInput(input: SendEmailInput): NormalizedSendEmailInput {
  const emailType = input.emailType ?? "notification";
  const from = input.from ?? getEmailSender(emailType);
  const senderConfigurationError = getEmailSenderConfigurationError(
    emailType,
    from,
  );

  if (senderConfigurationError) {
    throw new EmailSendError(senderConfigurationError, "invalid_sender");
  }

  if (!input.subject.trim()) {
    throw new EmailSendError("Email subject is required.", "missing_subject");
  }

  if (!input.html.trim()) {
    throw new EmailSendError("Email HTML body is required.", "missing_html");
  }

  if (!input.idempotencyKey?.trim()) {
    throw new EmailSendError(
      "Email idempotency key is required.",
      "missing_idempotency_key",
    );
  }

  if (input.idempotencyKey.length > 256) {
    throw new EmailSendError(
      "Email idempotency key must be 256 characters or fewer.",
      "invalid_idempotency_key",
    );
  }

  return {
    ...input,
    to: requireAddressList(input.to),
    cc: getAddressList(input.cc, "cc"),
    bcc: getAddressList(input.bcc, "bcc"),
    from,
    subject: input.subject.trim(),
    html: input.html,
    text: input.text?.trim() ? input.text : undefined,
    replyTo: getReplyTo(input.replyTo),
    emailType,
    idempotencyKey: input.idempotencyKey.trim(),
    metadata: normalizeMetadata(input.metadata),
    businessId: input.businessId ?? null,
    userId: input.userId ?? null,
  };
}

function getStoredBody(input: NormalizedSendEmailInput) {
  if (input.emailType !== "auth") {
    return {
      html: input.html,
      text: input.text,
    };
  }

  return {
    html: "[redacted auth email body]",
    text: input.text ? "[redacted auth email text]" : undefined,
  };
}

function getExistingSentResult(row: EmailOutboxRow): SendEmailResult | null {
  if (
    row.status !== "sent" ||
    !row.provider ||
    !row.providerMessageId
  ) {
    return null;
  }

  return {
    provider: row.provider,
    providerMessageId: row.providerMessageId,
    status: "queued",
  };
}

async function findOutboxByKey(idempotencyKey: string) {
  const [row] = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.idempotencyKey, idempotencyKey))
    .limit(1);

  return row ?? null;
}

async function findSuccessfulAttempt(emailOutboxId: string) {
  const [attempt] = await db
    .select()
    .from(emailAttempts)
    .where(
      and(
        eq(emailAttempts.emailOutboxId, emailOutboxId),
        eq(emailAttempts.status, "success"),
      ),
    )
    .limit(1);

  return attempt ?? null;
}

async function createOrClaimOutbox(input: NormalizedSendEmailInput) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS);
  const storedBody = getStoredBody(input);
  const [created] = await db
    .insert(emailOutbox)
    .values({
      id: newEntityId(),
      businessId: input.businessId,
      userId: input.userId,
      type: input.emailType,
      to: input.to,
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      from: input.from,
      subject: input.subject,
      html: storedBody.html,
      textBody: storedBody.text ?? null,
      status: "sending",
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: emailOutbox.idempotencyKey,
    })
    .returning();

  if (created) {
    return created;
  }

  const existing = await findOutboxByKey(input.idempotencyKey);
  const sentResult = existing ? getExistingSentResult(existing) : null;

  if (existing && sentResult) {
    return { existingSentResult: sentResult, outboxId: existing.id };
  }

  if (!existing) {
    throw new EmailSendError(
      "Email outbox record could not be created.",
      "email_outbox_unavailable",
    );
  }

  const successfulAttempt = await findSuccessfulAttempt(existing.id);

  if (successfulAttempt?.providerMessageId) {
    const recoveredResult = {
      provider: successfulAttempt.provider,
      providerMessageId: successfulAttempt.providerMessageId,
      status: "queued" as const,
    };
    await markOutboxSent(existing.id, recoveredResult);

    return {
      existingSentResult: recoveredResult,
      outboxId: existing.id,
    };
  }

  if (existing.status === "unknown") {
    throw new EmailSendError(
      "Email delivery status is unknown. Check provider logs before retrying.",
      "email_delivery_unknown",
    );
  }

  const [claimed] = await db
    .update(emailOutbox)
    .set({
      businessId: input.businessId,
      userId: input.userId,
      type: input.emailType,
      to: input.to,
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      from: input.from,
      subject: input.subject,
      html: storedBody.html,
      textBody: storedBody.text ?? null,
      status: "sending",
      provider: null,
      providerMessageId: null,
      lastError: null,
      metadata: input.metadata,
      updatedAt: now,
      sentAt: null,
    })
    .where(
      and(
        eq(emailOutbox.id, existing.id),
        or(
          inArray(emailOutbox.status, ["pending", "failed"]),
          and(
            eq(emailOutbox.status, "sending"),
            lt(emailOutbox.updatedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning();

  if (!claimed) {
    throw new EmailSendError(
      "Email delivery is already in progress for this idempotency key.",
      "email_send_in_progress",
    );
  }

  return claimed;
}

async function recordAttempt({
  emailOutboxId,
  provider,
  result,
  error,
  retryable,
}: {
  emailOutboxId: string;
  provider: EmailProviderName;
  result?: SendEmailResult;
  error?: { code: string | null; message: string };
  retryable: boolean;
}) {
  await db.insert(emailAttempts).values({
    id: newEntityId(),
    emailOutboxId,
    provider,
    status: result ? "success" : "failed",
    providerMessageId: result?.providerMessageId ?? null,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ? error.message.slice(0, 1000) : null,
    retryable,
    createdAt: new Date(),
  });

  await db
    .update(emailOutbox)
    .set({
      attempts: sql`${emailOutbox.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(emailOutbox.id, emailOutboxId));
}

async function markOutboxSent(
  emailOutboxId: string,
  result: SendEmailResult,
) {
  const now = new Date();

  await db
    .update(emailOutbox)
    .set({
      status: "sent",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      lastError: null,
      updatedAt: now,
      sentAt: now,
    })
    .where(eq(emailOutbox.id, emailOutboxId));
}

async function markOutboxFailed(
  emailOutboxId: string,
  status: "failed" | "unknown",
  errorMessage: string,
) {
  await db
    .update(emailOutbox)
    .set({
      status,
      lastError: errorMessage.slice(0, 1000),
      updatedAt: new Date(),
    })
    .where(eq(emailOutbox.id, emailOutboxId));
}

function logAttempt(
  level: "info" | "warn",
  event: string,
  details: Record<string, unknown>,
) {
  const payload = {
    ...details,
    recipientCount:
      typeof details.recipientCount === "number"
        ? details.recipientCount
        : undefined,
  };

  if (level === "info") {
    logInfo(event, payload);
    return;
  }

  logWarn(event, payload);
}

export async function sendEmailWithFallback(
  input: SendEmailInput,
  options: SendEmailOptions = {},
): Promise<SendEmailResult> {
  // Email is sent from route boundaries and from server actions. Reuse the
  // request/job correlation ID when one exists; otherwise give the send its
  // own so every provider attempt can still be joined.
  return ensureCorrelationId("email", () =>
    sendEmailWithFallbackInternal(input, options),
  );
}

async function sendEmailWithFallbackInternal(
  input: SendEmailInput,
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const normalizedInput = normalizeSendEmailInput(input);
  const claim = await createOrClaimOutbox(normalizedInput);

  if ("existingSentResult" in claim) {
    logAttempt("info", "email.send.skipped_sent", {
      emailOutboxId: claim.outboxId,
      idempotencyKey: normalizedInput.idempotencyKey,
      provider: claim.existingSentResult.provider,
      recipientCount: normalizedInput.to.length,
      emailType: normalizedInput.emailType,
    });
    return claim.existingSentResult;
  }

  const providers = (options.providers ?? defaultEmailProviders).filter(
    (provider) => provider.isConfigured(),
  );

  if (!providers.length) {
    const message = "Email delivery is not configured.";
    await markOutboxFailed(claim.id, "failed", message);
    throw new EmailSendError(message, "email_not_configured");
  }

  let lastRetryableError: EmailProviderError | null = null;

  for (const provider of providers) {
    logAttempt("info", "email.provider.attempt_started", {
      emailOutboxId: claim.id,
      provider: provider.name,
      idempotencyKey: normalizedInput.idempotencyKey,
      recipientCount: normalizedInput.to.length,
      emailType: normalizedInput.emailType,
    });

    try {
      const result = await provider.send(normalizedInput);

      await recordAttempt({
        emailOutboxId: claim.id,
        provider: provider.name,
        result,
        retryable: false,
      });
      await markOutboxSent(claim.id, result);

      logAttempt("info", "email.provider.accepted", {
        emailOutboxId: claim.id,
        provider: provider.name,
        idempotencyKey: normalizedInput.idempotencyKey,
        providerMessageId: result.providerMessageId,
        recipientCount: normalizedInput.to.length,
        emailType: normalizedInput.emailType,
      });

      return result;
    } catch (error) {
      const providerError =
        error instanceof EmailProviderError
          ? error
          : wrapEmailProviderError(provider.name, error);
      const classification = classifyEmailError(providerError);

      await recordAttempt({
        emailOutboxId: claim.id,
        provider: provider.name,
        error: {
          code: classification.code,
          message: classification.message,
        },
        retryable: classification.retryable,
      });

      logAttempt("warn", "email.provider.attempt_failed", {
        emailOutboxId: claim.id,
        provider: provider.name,
        idempotencyKey: normalizedInput.idempotencyKey,
        statusCode: classification.statusCode,
        errorCode: classification.code,
        retryable: classification.retryable,
        ambiguous: classification.ambiguous,
        recipientCount: normalizedInput.to.length,
        emailType: normalizedInput.emailType,
      });

      if (classification.ambiguous) {
        await markOutboxFailed(claim.id, "unknown", classification.message);
        throw new EmailSendError(
          "Email delivery status is unknown. Check provider logs before retrying.",
          "email_delivery_unknown",
        );
      }

      if (!classification.retryable) {
        await markOutboxFailed(claim.id, "failed", classification.message);
        throw new EmailSendError(
          classification.message,
          "email_delivery_rejected",
        );
      }

      lastRetryableError = providerError;
    }
  }

  const message =
    lastRetryableError?.message ??
    "All configured email providers failed to accept the message.";

  await markOutboxFailed(claim.id, "failed", message);
  throw new EmailSendError(message, "email_delivery_failed");
}
