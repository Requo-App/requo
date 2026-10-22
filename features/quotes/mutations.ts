import "server-only";

import { and, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";

import { writeAuditLog } from "@/features/audit/mutations";
import { autoCloseFollowUpsForQuote, terminateRecurringFollowUpsForRecords } from "@/features/follow-ups/mutations";
import { notifyOwnerQuoteViewed } from "@/features/quotes/defaults";
import { db } from "@/lib/db/client";
import { newEntityId } from "@/lib/ids";
import {
  activityLogs,
  followUps,
  inquiries,
  quoteAcceptances,
  quoteItems,
  quotes,
  businesses,
  } from "@/lib/db/schema";
import {
  QUOTE_ACCEPTANCE_METHOD_TYPED_NAME,
  QUOTE_ACCEPTANCE_TEXT,
  QUOTE_ACCEPTANCE_TEXT_VERSION,
  buildAcceptanceSnapshot,
  hashAcceptanceSnapshot,
  validateSignerName,
} from "@/features/quotes/acceptance";
import type { QuoteEditorInput } from "@/features/quotes/schemas";
import { quoteAcceptanceValidationMessages } from "@/features/quotes/schemas";
import type { AiQuoteMissingInfoItem } from "@/lib/db/schema/quotes";
import type { QuoteDeliveryMethod, QuoteStatus } from "@/features/quotes/types";
import {
  computeQuoteAiReadiness,
  getTodayUtcDateString,
} from "@/features/quotes/utils";
import { insertBusinessNotification } from "@/features/notifications/mutations";
import {
  createStoredQuotePublicToken,
  getQuotePublicTokenLookupCondition,
  tryResolveStoredQuotePublicToken,
} from "@/features/quotes/token-storage";

function getNextQuoteNumberFromSequence(sequence: number | null | undefined) {
  const safeSequence =
    typeof sequence === "number" && Number.isFinite(sequence) && sequence > 0
      ? Math.trunc(sequence)
      : 0;

  return `Q-${String(safeSequence + 1).padStart(4, "0")}`;
}

/**
 * Resolves the persisted provenance for a line item. When the owner edited a
 * generated item (the editor marks it with `owner_brief`), the item is
 * downgraded to `owner_set` and its library references are cleared — the
 * server never accepts stale AI provenance for a line the owner changed.
 */
function resolveItemAiProductStatus(
  item: QuoteEditorInput["items"][number],
) {
  const ownerEdited = item.aiReview?.pricingSource === "owner_brief";

  if (ownerEdited) {
    return {
      aiProductStatus: "owner_set" as const,
      aiProductLibraryEntryId: null,
      aiProductLibraryItemId: null,
      aiEvidence: null,
    };
  }

  const evidence = item.aiEvidence;

  return {
    aiProductStatus: item.aiProductStatus ?? null,
    aiProductLibraryEntryId: item.aiProductLibraryEntryId ?? null,
    aiProductLibraryItemId: item.aiProductLibraryItemId ?? null,
    aiEvidence: evidence
      ? {
          entryId: evidence.entryId ?? null,
          itemId: evidence.itemId ?? null,
          sourceLabel: evidence.sourceLabel ?? null,
          matchType: evidence.matchType ?? "none",
          reason: evidence.reason ?? "",
        }
      : null,
  };
}

function resolveQuoteAiMissingInfo(
  quote: QuoteEditorInput,
): AiQuoteMissingInfoItem[] | null {
  if (!quote.aiMissingInfo?.length) {
    return null;
  }

  return quote.aiMissingInfo.map((item) => ({
    label: item.label,
    question: item.question,
    critical: item.critical ?? false,
  }));
}

/**
 * Builds the persisted line items and the quote totals.
 *
 * `existingItemIds` carries the ids already stored for the quote. A submitted
 * line that still exists keeps its id, so the customer's per-item revision
 * comments keep pointing at the right row; a new line gets a fresh id.
 */
function calculateQuoteTotals(
  input: QuoteEditorInput,
  existingItemIds?: Set<string>,
) {
  const items = input.items.map((item, index) => ({
    id:
      existingItemIds?.has(item.id) === true ? item.id : newEntityId(),
    description: item.description,
    quantity: item.quantity,
    unitPriceInCents: item.unitPriceInCents,
    lineTotalInCents: item.quantity * item.unitPriceInCents,
    position: index,
    ...resolveItemAiProductStatus(item),
  }));
  const subtotalInCents = items.reduce(
    (sum, item) => sum + item.lineTotalInCents,
    0,
  );
  const taxInCents = input.taxInCents ?? 0;
  const totalInCents = subtotalInCents - input.discountInCents + taxInCents;

  return {
    items,
    subtotalInCents,
    discountInCents: input.discountInCents,
    taxInCents,
    totalInCents,
  };
}

function isRetryableUniqueConflict(error: unknown) {
  const retryableConstraints = new Set([
    "quotes_business_quote_number_unique",
    "quotes_public_token_unique",
    "quotes_public_token_hash_unique",
    "quote_acceptances_quote_version_unique",
  ]);
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  if ((error as { code?: unknown }).code !== "23505") return false;
  const names = [
    (error as Record<string, unknown>).constraint_name,
    (error as Record<string, unknown>).constraint,
  ];
  return names.some((name) => typeof name === "string" && retryableConstraints.has(name));
}

function truncateNotificationMessage(
  value: string | null | undefined,
  maxLength = 120,
) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.length <= maxLength) {
    return trimmedValue;
  }

  return `${trimmedValue.slice(0, maxLength - 3).trimEnd()}...`;
}

function getStoredEffectiveQuoteStatus(
  status: QuoteStatus,
  validUntil: string,
) {
  return status === "sent" && validUntil < getTodayUtcDateString()
    ? "expired"
    : status;
}

async function maybeMoveInquiryToQuoted(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  inquiryId: string | null,
  now: Date,
) {
  if (!inquiryId) {
    return false;
  }

  const [updatedInquiry] = await tx
    .update(inquiries)
    .set({
      status: "quoted",
      updatedAt: now,
    })
    .where(
      and(
        eq(inquiries.id, inquiryId),
        eq(inquiries.businessId, businessId),
        inArray(inquiries.status, ["new", "waiting"]),
        isNull(inquiries.archivedAt),
      ),
    )
    .returning({ id: inquiries.id });

  return Boolean(updatedInquiry);
}

async function maybeMoveInquiryToWon(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  inquiryId: string | null,
  now: Date,
) {
  if (!inquiryId) {
    return false;
  }

  const [updatedInquiry] = await tx
    .update(inquiries)
    .set({
      status: "won",
      updatedAt: now,
    })
    .where(
      and(
        eq(inquiries.id, inquiryId),
        eq(inquiries.businessId, businessId),
        inArray(inquiries.status, ["new", "quoted", "waiting"]),
        isNull(inquiries.archivedAt),
      ),
    )
    .returning({ id: inquiries.id });

  return Boolean(updatedInquiry);
}

async function insertQuoteActivity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  {
    businessId,
    inquiryId,
    quoteId,
    actorUserId,
    type,
    summary,
    metadata,
    now,
  }: {
    businessId: string;
    inquiryId?: string | null;
    quoteId: string;
    actorUserId?: string | null;
    type: string;
    summary: string;
    metadata?: Record<string, unknown>;
    now: Date;
  },
) {
  await tx.insert(activityLogs).values({
    id: newEntityId(),
    businessId,
    inquiryId: inquiryId ?? null,
    quoteId,
    actorUserId: actorUserId ?? null,
    type,
    summary,
    metadata: metadata ?? {},
    createdAt: now,
    updatedAt: now,
  });
}

async function expireQuoteRows(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  rows: Array<{
    id: string;
    businessId: string;
    inquiryId: string | null;
    quoteNumber: string;
  }>,
) {
  if (!rows.length) {
    return { count: 0, expired: [] as typeof rows };
  }

  const now = new Date();

  // Only the rows this call actually transitions are logged, so two
  // concurrent sweeps cannot write the same "quote expired" activity twice.
  const expired = await tx
    .update(quotes)
    .set({
      status: "expired",
      updatedAt: now,
    })
    .where(
      and(
        inArray(quotes.id, rows.map((row) => row.id)),
        eq(quotes.status, "sent"),
      ),
    )
    .returning({ id: quotes.id });

  const expiredIds = new Set(expired.map((row) => row.id));
  const expiredRows = rows.filter((row) => expiredIds.has(row.id));

  if (expiredRows.length === 0) {
    return { count: 0, expired: [] as typeof rows };
  }

  await tx.insert(activityLogs).values(
    expiredRows.map((row) => ({
      id: newEntityId(),
      businessId: row.businessId,
      inquiryId: row.inquiryId,
      quoteId: row.id,
      actorUserId: null,
      type: "quote.expired",
      summary: `Quote ${row.quoteNumber} expired after its validity date passed.`,
      metadata: {
        quoteNumber: row.quoteNumber,
      },
      createdAt: now,
      updatedAt: now,
    })),
  );

  return { count: expiredRows.length, expired: expiredRows };
}

/**
 * Stop the recurring follow-up series of quotes that just expired.
 *
 * Runs after the expiry transaction commits so the follow-up rows are not
 * locked inside the quote transaction.
 */
async function terminateFollowUpsForExpiredQuotes(
  expired: Array<{ id: string; businessId: string }>,
) {
  const byBusiness = new Map<string, string[]>();

  for (const row of expired) {
    const ids = byBusiness.get(row.businessId) ?? [];
    ids.push(row.id);
    byBusiness.set(row.businessId, ids);
  }

  for (const [businessId, quoteIds] of byBusiness) {
    await terminateRecurringFollowUpsForRecords({
      businessId,
      records: quoteIds.map((quoteId) => ({ quoteId, newStatus: "expired" })),
    });
  }
}

export async function syncExpiredQuotesForBusiness(businessId: string) {
  const today = getTodayUtcDateString();
  const rows = await db
    .select({
      id: quotes.id,
      businessId: quotes.businessId,
      inquiryId: quotes.inquiryId,
      quoteNumber: quotes.quoteNumber,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.businessId, businessId),
        eq(quotes.status, "sent"),
        isNull(quotes.deletedAt),
        lt(quotes.validUntil, today),
      ),
    );

  if (!rows.length) {
    return 0;
  }

  const { count, expired } = await db.transaction((tx) => expireQuoteRows(tx, rows));

  await terminateFollowUpsForExpiredQuotes(expired);

  return count;
}

/**
 * Sweep all sent quotes whose validity date has passed across every business.
 *
 * Called from the daily cron to keep expired quotes reconciled even when
 * nobody opens the quote list. The per-business helper still runs on read
 * paths as a fast secondary reconciliation.
 *
 * Processed in batches to keep transactions bounded; iterates until no rows
 * remain so a one-off backlog after a cron outage still drains.
 */
export async function syncExpiredQuotesGlobal({
  batchSize = 200,
  maxBatches = 50,
}: {
  batchSize?: number;
  maxBatches?: number;
} = {}) {
  const today = getTodayUtcDateString();
  let totalExpired = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const rows = await db
      .select({
        id: quotes.id,
        businessId: quotes.businessId,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.status, "sent"),
          isNull(quotes.deletedAt),
          lt(quotes.validUntil, today),
        ),
      )
      .limit(batchSize);

    if (rows.length === 0) {
      break;
    }

    const { expired } = await db.transaction((tx) => expireQuoteRows(tx, rows));

    await terminateFollowUpsForExpiredQuotes(expired);

    totalExpired += rows.length;
    batches += 1;

    if (rows.length < batchSize) {
      break;
    }
  }

  return { expired: totalExpired, batches };
}

export async function syncExpiredQuoteForPublicToken(token: string) {
  const today = getTodayUtcDateString();
  const rows = await db
    .select({
      id: quotes.id,
      businessId: quotes.businessId,
      inquiryId: quotes.inquiryId,
      quoteNumber: quotes.quoteNumber,
    })
    .from(quotes)
    .where(
      and(
        getQuotePublicTokenLookupCondition(token),
        eq(quotes.status, "sent"),
        isNull(quotes.deletedAt),
        lt(quotes.validUntil, today),
      ),
    )
    .limit(1);

  if (!rows.length) {
    return 0;
  }

  const { count, expired } = await db.transaction((tx) => expireQuoteRows(tx, rows));

  await terminateFollowUpsForExpiredQuotes(expired);

  return count;
}

type CreateQuoteForBusinessInput = {
  businessId: string;
  actorUserId: string;
  currency: string;
  inquiryId?: string | null;
  quote: QuoteEditorInput;
};

export async function createQuoteForBusiness({
  businessId,
  actorUserId,
  currency,
  inquiryId = null,
  quote,
}: CreateQuoteForBusinessInput) {
  const quoteId = newEntityId();
  const totals = calculateQuoteTotals(quote);
  const resolvedMissingInfo = resolveQuoteAiMissingInfo(quote);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await db.transaction(async (tx) => {
        const [business] = await tx
          .select({
            businessId: businesses.id,
          })
          .from(businesses)
          .where(eq(businesses.id, businessId))
          .limit(1);

        if (!business) {
          return null;
        }

        if (inquiryId) {
          const [inquiry] = await tx
            .select({ id: inquiries.id })
            .from(inquiries)
            .where(
              and(
                eq(inquiries.id, inquiryId),
                eq(inquiries.businessId, businessId),
              ),
            )
            .limit(1);

          if (!inquiry) {
            return null;
          }
        }

        const [latestQuote] = await tx
          .select({
            latestSequence: sql<number>`coalesce(max((nullif(substring(${quotes.quoteNumber} from '[0-9]+$'), ''))::integer), 0)`,
          })
          .from(quotes)
          .where(eq(quotes.businessId, businessId))
          .limit(1);
        const quoteNumber = getNextQuoteNumberFromSequence(
          latestQuote?.latestSequence,
        );
        const storedPublicToken = createStoredQuotePublicToken();
        const now = new Date();

        await tx.insert(quotes).values({
          id: quoteId,
          businessId,
          inquiryId,
          status: "draft",
          quoteNumber,
          publicToken: storedPublicToken.publicToken,
          publicTokenHash: storedPublicToken.publicTokenHash,
          title: quote.title,
          customerName: quote.customerName,
          customerEmail: quote.customerContactMethod === "email" ? quote.customerContactHandle : quote.customerEmail ?? null,
          customerContactMethod: quote.customerContactMethod,
          customerContactHandle: quote.customerContactHandle,
          currency,
          notes: quote.notes ?? null,
          terms: quote.terms ?? null,
          subtotalInCents: totals.subtotalInCents,
          discountInCents: totals.discountInCents,
          taxInCents: totals.taxInCents,
          taxLabel: quote.taxLabel?.trim() || null,
          totalInCents: totals.totalInCents,
          validUntil: quote.validUntil,
          aiReadiness: computeQuoteAiReadiness({
            items: totals.items,
            missingInfo: resolvedMissingInfo,
          }),
          aiMissingInfo: resolvedMissingInfo,
          aiGenerationId: quote.aiGenerationId?.trim() || null,
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(quoteItems).values(
          totals.items.map((item) => ({
            id: item.id,
            businessId,
            quoteId,
            description: item.description,
            quantity: item.quantity,
            unitPriceInCents: item.unitPriceInCents,
            lineTotalInCents: item.lineTotalInCents,
            position: item.position,
            aiProductStatus: item.aiProductStatus,
            aiProductLibraryEntryId: item.aiProductLibraryEntryId,
            aiProductLibraryItemId: item.aiProductLibraryItemId,
            aiEvidence: item.aiEvidence,
            createdAt: now,
            updatedAt: now,
          })),
        );

        await insertQuoteActivity(tx, {
          businessId,
          inquiryId,
          quoteId,
          actorUserId,
          type: "quote.created",
          summary: `Draft quote ${quoteNumber} created.`,
          metadata: {
            quoteNumber,
          },
          now,
        });

        await writeAuditLog(tx, {
          businessId,
          actorUserId,
          entityType: "quote",
          entityId: quoteId,
          action: "quote.created",
          metadata: {
            quoteNumber,
            title: quote.title,
            customerName: quote.customerName,
          },
          createdAt: now,
        });

        return {
          id: quoteId,
          quoteNumber,
        };
      });

      if (created) {
        // No automation event on quote creation; workflow defaults are
        // evaluated at send time (auto follow-ups) and qualification time.
        return created;
      }

      // Transaction returned null when the business or linked inquiry was
      // not found (or belongs to a different business). No point retrying.
      return null;
    } catch (error) {
      if (attempt < 4 && isRetryableUniqueConflict(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to allocate a unique quote number.");
}

type UpdateQuoteForBusinessInput = {
  businessId: string;
  quoteId: string;
  actorUserId: string;
  quote: QuoteEditorInput;
};

export async function updateQuoteForBusiness({
  businessId,
  quoteId,
  actorUserId,
  quote,
}: UpdateQuoteForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        status: quotes.status,
        quoteNumber: quotes.quoteNumber,
        currency: quotes.currency,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
        businessId: businesses.id,
        title: quotes.title,
        customerName: quotes.customerName,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote) {
      return null;
    }

    if (
      existingQuote.deletedAt ||
      existingQuote.archivedAt ||
      existingQuote.status !== "draft"
    ) {
      return {
        updated: false,
        locked: true,
        status: existingQuote.status,
      } as const;
    }

    const existingItemRows = await tx
      .select({ id: quoteItems.id })
      .from(quoteItems)
      .where(
        and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.businessId, businessId)),
      );
    const totals = calculateQuoteTotals(
      quote,
      new Set(existingItemRows.map((row) => row.id)),
    );
    const resolvedMissingInfo = resolveQuoteAiMissingInfo(quote);

    await tx
      .update(quotes)
      .set({
        title: quote.title,
        customerName: quote.customerName,
        customerEmail: quote.customerContactMethod === "email" ? quote.customerContactHandle : quote.customerEmail ?? null,
        customerContactMethod: quote.customerContactMethod,
        customerContactHandle: quote.customerContactHandle,
        notes: quote.notes ?? null,
        terms: quote.terms ?? null,
        subtotalInCents: totals.subtotalInCents,
        discountInCents: totals.discountInCents,
        taxInCents: totals.taxInCents,
        taxLabel: quote.taxLabel?.trim() || null,
        totalInCents: totals.totalInCents,
        validUntil: quote.validUntil,
        aiReadiness: computeQuoteAiReadiness({
          items: totals.items,
          missingInfo: resolvedMissingInfo,
        }),
        aiMissingInfo: resolvedMissingInfo,
        aiGenerationId: quote.aiGenerationId?.trim() || null,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    await tx
      .delete(quoteItems)
      .where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.businessId, businessId)));

    await tx.insert(quoteItems).values(
      totals.items.map((item) => ({
        id: item.id,
        businessId,
        quoteId,
        description: item.description,
        quantity: item.quantity,
        unitPriceInCents: item.unitPriceInCents,
        lineTotalInCents: item.lineTotalInCents,
        position: item.position,
        aiProductStatus: item.aiProductStatus,
        aiProductLibraryEntryId: item.aiProductLibraryEntryId,
        aiProductLibraryItemId: item.aiProductLibraryItemId,
        aiEvidence: item.aiEvidence,
        createdAt: now,
        updatedAt: now,
      })),
    );

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.updated",
      summary: `Draft quote ${existingQuote.quoteNumber} updated.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
      },
      now,
    });

    return {
      updated: true,
      locked: false,
      status: existingQuote.status,
      currency: existingQuote.currency,
    } as const;
  });
}

type UpdateQuoteRecordStateForBusinessInput = {
  businessId: string;
  quoteId: string;
  actorUserId: string;
};

export async function deleteDraftQuoteForBusiness({
  businessId,
  quoteId,
  actorUserId,
}: UpdateQuoteRecordStateForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        validUntil: quotes.validUntil,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
        businessId: businesses.id,
        title: quotes.title,
        customerName: quotes.customerName,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote) {
      return null;
    }

    const effectiveStatus = getStoredEffectiveQuoteStatus(
      existingQuote.status,
      existingQuote.validUntil,
    );

    if (existingQuote.deletedAt) {
      return {
        deleted: false,
        locked: false,
        inquiryId: existingQuote.inquiryId,
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      };
    }

    if (existingQuote.archivedAt || effectiveStatus !== "draft") {
      return {
        deleted: false,
        locked: true,
        lockedReason: existingQuote.archivedAt ? "archived" : "lifecycle",
        inquiryId: existingQuote.inquiryId,
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      } as const;
    }

    await tx
      .update(quotes)
      .set({
        deletedAt: now,
        deletedBy: actorUserId,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.deleted_draft",
      summary: `Draft quote ${existingQuote.quoteNumber} deleted.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
      },
      now,
    });

    await writeAuditLog(tx, {
      businessId: existingQuote.businessId,
      actorUserId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.draft_deleted",
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        title: existingQuote.title,
        customerName: existingQuote.customerName,
      },
      createdAt: now,
    });

    return {
      deleted: true,
      locked: false,
      inquiryId: existingQuote.inquiryId,
      quoteNumber: existingQuote.quoteNumber,
      status: effectiveStatus,
    } as const;
  });
}

export async function archiveQuoteForBusiness({
  businessId,
  quoteId,
  actorUserId,
}: UpdateQuoteRecordStateForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        validUntil: quotes.validUntil,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
      })
      .from(quotes)
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote || existingQuote.deletedAt) {
      return null;
    }

    const effectiveStatus = getStoredEffectiveQuoteStatus(
      existingQuote.status,
      existingQuote.validUntil,
    );

    if (effectiveStatus === "draft") {
      return {
        changed: false,
        locked: true,
        lockedReason: "draft",
        inquiryId: existingQuote.inquiryId,
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      } as const;
    }

    if (existingQuote.archivedAt) {
      return {
        changed: false,
        locked: false,
        inquiryId: existingQuote.inquiryId,
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      };
    }

    await tx
      .update(quotes)
      .set({
        archivedAt: now,
        archivedBy: actorUserId,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.archived",
      summary: `Quote ${existingQuote.quoteNumber} archived.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      },
      now,
    });

    await writeAuditLog(tx, {
      businessId,
      actorUserId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.archived",
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      },
      createdAt: now,
    });

    return {
      changed: true,
      locked: false,
      inquiryId: existingQuote.inquiryId,
      quoteNumber: existingQuote.quoteNumber,
      status: effectiveStatus,
    };
  });
}

export async function restoreArchivedQuoteForBusiness({
  businessId,
  quoteId,
  actorUserId,
}: UpdateQuoteRecordStateForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        validUntil: quotes.validUntil,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
      })
      .from(quotes)
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote || existingQuote.deletedAt) {
      return null;
    }

    const effectiveStatus = getStoredEffectiveQuoteStatus(
      existingQuote.status,
      existingQuote.validUntil,
    );

    if (!existingQuote.archivedAt) {
      return {
        changed: false,
        locked: false,
        inquiryId: existingQuote.inquiryId,
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      };
    }

    await tx
      .update(quotes)
      .set({
        archivedAt: null,
        archivedBy: null,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.unarchived",
      summary: `Quote ${existingQuote.quoteNumber} restored to active.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      },
      now,
    });

    await writeAuditLog(tx, {
      businessId,
      actorUserId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.unarchived",
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
      },
      createdAt: now,
    });

    return {
      changed: true,
      locked: false,
      inquiryId: existingQuote.inquiryId,
      quoteNumber: existingQuote.quoteNumber,
      status: effectiveStatus,
    };
  });
}

export async function voidQuoteForBusiness({
  businessId,
  quoteId,
  actorUserId,
}: UpdateQuoteRecordStateForBusinessInput) {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        validUntil: quotes.validUntil,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
        sentAt: quotes.sentAt,
        businessId: businesses.id,
        title: quotes.title,
        customerName: quotes.customerName,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote || existingQuote.deletedAt) {
      return null;
    }

    const effectiveStatus = getStoredEffectiveQuoteStatus(
      existingQuote.status,
      existingQuote.validUntil,
    );

    let expiredInThisCall = false;

    if (existingQuote.status === "sent" && effectiveStatus === "expired") {
      const expiry = await expireQuoteRows(tx, [
        {
          id: existingQuote.id,
          businessId,
          inquiryId: existingQuote.inquiryId,
          quoteNumber: existingQuote.quoteNumber,
        },
      ]);
      expiredInThisCall = expiry.count > 0;
    }

    if (effectiveStatus === "voided") {
      return {
        changed: false,
        locked: false,
        inquiryId: existingQuote.inquiryId,
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
        expiredInThisCall,
      };
    }

    if (effectiveStatus !== "sent") {
      return {
        changed: false,
        locked: true,
        inquiryId: existingQuote.inquiryId,
        quoteNumber: existingQuote.quoteNumber,
        status: effectiveStatus,
        expiredInThisCall,
      } as const;
    }

    await tx
      .update(quotes)
      .set({
        status: "voided",
        voidedAt: now,
        voidedBy: actorUserId,
        acceptedAt: null,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.voided",
      summary: `Quote ${existingQuote.quoteNumber} voided.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
      },
      now,
    });

    await writeAuditLog(tx, {
      businessId: existingQuote.businessId,
      actorUserId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.voided",
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        title: existingQuote.title,
        customerName: existingQuote.customerName,
      },
      createdAt: now,
    });

    return {
      changed: true,
      locked: false,
      inquiryId: existingQuote.inquiryId,
      quoteNumber: existingQuote.quoteNumber,
      status: "voided" as const,
      expiredInThisCall,
    };
  });

  // A voided quote is terminal: stop the recurring follow-up series linked to it.
  if (result?.changed) {
    await terminateRecurringFollowUpsForRecords({
      businessId,
      records: [{ quoteId, newStatus: "voided" }],
    });
  } else if (result?.expiredInThisCall) {
    await terminateRecurringFollowUpsForRecords({
      businessId,
      records: [{ quoteId, newStatus: "expired" }],
    });
  }

  return result;
}

type MarkQuoteSentForBusinessInput = {
  businessId: string;
  quoteId: string;
  actorUserId: string;
  sendMethod?: QuoteDeliveryMethod;
};

/**
 * Collects the pack-aware send gates for a quote.
 *
 * The gates are the product's own readiness rules: incomplete required scope
 * blocks, critical intake gaps, and a payment schedule whose total no
 * longer matches the draft. Callers MUST run this before emailing a customer
 * — the customer must never receive a quote the server considers unsendable.
 *
 * Read-only, so it is safe to call from inside an open transaction.
 */
export async function collectQuoteSendGates({
  businessId,
  quoteId,
  inquiryId,
  quoteTotalCents,
  validUntil,
}: {
  businessId: string;
  quoteId: string;
  inquiryId: string | null;
  quoteTotalCents: number;
  validUntil?: string;
}) {
  const { evaluateScopeSendGate } = await import("@/features/scope-blocks/queries");
  const { evaluateIntakeReadiness } = await import("@/features/businesses/intake-bindings");
  const { getEditableScheduleForQuote } = await import("@/features/payment-schedules/queries");

  const [scopeGate, readiness] = await Promise.all([
    evaluateScopeSendGate({ businessId, quoteId }),
    evaluateIntakeReadiness({ businessId, inquiryId }),
  ]);

  const blockers = [
    ...scopeGate.blocking.map((blocker) => blocker.reason),
    ...readiness.blockedReasons,
  ];

  // A quote whose validity date has already passed would be expired the
  // moment the customer opens it, so it must not be sent.
  if (validUntil && validUntil < getTodayUtcDateString()) {
    blockers.push("Update the validity date before sending this quote.");
  }

  const editableSchedule = await getEditableScheduleForQuote({ businessId, quoteId });

  if (editableSchedule && editableSchedule.quoteTotalCents !== quoteTotalCents) {
    blockers.push(
      "The payment schedule no longer matches the quote total. Re-save it before sending.",
    );
  }

  return { blockers };
}

/**
 * Evaluates the send gates and records the blocked attempt in the activity
 * log. Call this before any customer-facing delivery.
 */
export async function evaluateQuoteSendGates({
  businessId,
  quoteId,
  actorUserId,
  inquiryId,
  quoteNumber,
  quoteTotalCents,
  validUntil,
}: {
  businessId: string;
  quoteId: string;
  actorUserId: string;
  inquiryId: string | null;
  quoteNumber: string;
  quoteTotalCents: number;
  validUntil?: string;
}) {
  const { blockers } = await collectQuoteSendGates({
    businessId,
    quoteId,
    inquiryId,
    quoteTotalCents,
    validUntil,
  });

  if (blockers.length > 0) {
    await db.transaction(async (tx) => {
      await insertQuoteActivity(tx, {
        businessId,
        inquiryId,
        quoteId,
        actorUserId,
        type: "quote.send_blocked",
        summary: `Quote ${quoteNumber} send blocked: ${blockers[0]}.`,
        metadata: { quoteNumber, blockers: blockers.slice(0, 5) },
        now: new Date(),
      });
    });
  }

  return { blocked: blockers.length > 0, blockers };
}

export async function markQuoteSentForBusiness({
  businessId,
  quoteId,
  actorUserId,
  sendMethod = "requo",
}: MarkQuoteSentForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        publicToken: quotes.publicToken,
        status: quotes.status,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
        businessId: businesses.id,
        title: quotes.title,
        customerName: quotes.customerName,
        totalInCents: quotes.totalInCents,
        validUntil: quotes.validUntil,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote || existingQuote.deletedAt) {
      return null;
    }

    if (existingQuote.archivedAt || existingQuote.status !== "draft") {
      return {
        changed: false,
        status: existingQuote.status,
        quoteNumber: existingQuote.quoteNumber,
        inquiryId: existingQuote.inquiryId,
        publicToken: tryResolveStoredQuotePublicToken(existingQuote),
      };
    }

    // Pack-aware send gates (verticalization P3/P4/P5): incomplete required
    // scope blocks hard-block; critical intake gaps block; a schedule whose
    // totals no longer match the draft blocks re-send until re-saved
    // (stale gate — no silent mutation of reviewed commercial meaning).
    const { blockers } = await collectQuoteSendGates({
      businessId,
      quoteId,
      inquiryId: existingQuote.inquiryId,
      quoteTotalCents: existingQuote.totalInCents,
      validUntil: existingQuote.validUntil,
    });

    if (blockers.length > 0) {
      await insertQuoteActivity(tx, {
        businessId,
        inquiryId: existingQuote.inquiryId,
        quoteId,
        actorUserId,
        type: "quote.send_blocked",
        summary: `Quote ${existingQuote.quoteNumber} send blocked: ${blockers[0]}.`,
        metadata: { quoteNumber: existingQuote.quoteNumber, blockers: blockers.slice(0, 5) },
        now,
      });

      return {
        changed: false,
        blocked: true as const,
        blockers,
        status: existingQuote.status,
        quoteNumber: existingQuote.quoteNumber,
        inquiryId: existingQuote.inquiryId,
        publicToken: tryResolveStoredQuotePublicToken(existingQuote),
      };
    }

    await tx
      .update(quotes)
      .set({
        status: "sent",
        sentAt: now,
        acceptedAt: null,
        publicViewedAt: null,
        customerRespondedAt: null,
        customerResponseMessage: null,
        // The follow-up delay is measured from this send, not from the
        // previous version's send.
        autoFollowUpLastSentAt: null,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    await maybeMoveInquiryToQuoted(tx, businessId, existingQuote.inquiryId, now);

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.sent",
      summary:
        sendMethod === "manual"
          ? `Quote ${existingQuote.quoteNumber} marked as sent after manual delivery.`
          : `Quote ${existingQuote.quoteNumber} sent with Requo email.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        sendMethod,
      },
      now,
    });

    await writeAuditLog(tx, {
      businessId: existingQuote.businessId,
      actorUserId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.sent",
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        title: existingQuote.title,
        customerName: existingQuote.customerName,
        sendMethod,
      },
      createdAt: now,
    });

    return {
      changed: true,
      status: "sent" as const,
      quoteNumber: existingQuote.quoteNumber,
      inquiryId: existingQuote.inquiryId,
      publicToken: tryResolveStoredQuotePublicToken(existingQuote),
    };
  });
}

type AcknowledgeQuoteUncertaintyForBusinessInput = {
  businessId: string;
  quoteId: string;
  actorUserId: string;
};

/**
 * Records the owner's explicit acknowledgement that AI-suggested pricing was
 * reviewed and accepted. Required before a `needs_confirmation` quote can be
 * sent. Idempotent; auditing the acknowledgement is part of the write.
 */
export async function acknowledgeQuoteUncertaintyForBusiness({
  businessId,
  quoteId,
  actorUserId,
}: AcknowledgeQuoteUncertaintyForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        aiReadiness: quotes.aiReadiness,
        aiAcknowledgedAt: quotes.aiAcknowledgedAt,
        deletedAt: quotes.deletedAt,
        businessId: businesses.id,
        title: quotes.title,
        customerName: quotes.customerName,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote || existingQuote.deletedAt) {
      return null;
    }

    if (existingQuote.status !== "draft") {
      return {
        updated: false,
        locked: true,
        status: existingQuote.status,
      } as const;
    }

    if (existingQuote.aiReadiness !== "needs_confirmation") {
      return {
        updated: false,
        locked: false,
        status: existingQuote.status,
      } as const;
    }

    if (existingQuote.aiAcknowledgedAt) {
      return {
        updated: false,
        locked: false,
        status: existingQuote.status,
      } as const;
    }

    await tx
      .update(quotes)
      .set({
        aiAcknowledgedAt: now,
        aiAcknowledgedBy: actorUserId,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.ai_pricing_acknowledged",
      summary: `AI-generated pricing for quote ${existingQuote.quoteNumber} reviewed and confirmed by owner.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
      },
      now,
    });

    await writeAuditLog(tx, {
      businessId: existingQuote.businessId,
      actorUserId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.ai_pricing_acknowledged",
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        title: existingQuote.title,
        customerName: existingQuote.customerName,
      },
      createdAt: now,
    });

    return {
      updated: true,
      locked: false,
      status: existingQuote.status,
    } as const;
  });
}

type LogQuoteSendEventInput = {
  businessId: string;
  quoteId: string;
  inquiryId: string | null;
  actorUserId: string;
  eventType: string;
  channel?: string;
};

const sendEventSummaries: Record<string, string> = {
  copied_link: "Quote link copied",
  copied_message: "Quote message copied",
  opened_email_app: "Email compose opened",
  copied_followup: "Follow-up message copied",
};

export async function logQuoteSendEvent({
  businessId,
  quoteId,
  inquiryId,
  actorUserId,
  eventType,
  channel,
}: LogQuoteSendEventInput) {
  const now = new Date();
  const channelLabel = channel ? ` via ${channel}` : "";
  const baseSummary =
    sendEventSummaries[eventType] ?? "Quote send action recorded";
  const summary = `${baseSummary}${channelLabel}.`;

  await db.transaction(async (tx) => {
    await insertQuoteActivity(tx, {
      businessId,
      inquiryId,
      quoteId,
      actorUserId,
      type: `quote.send.${eventType}`,
      summary,
      metadata: {
        eventType,
        ...(channel ? { channel } : {}),
      },
      now,
    });
  });
}

export async function recordQuotePublicViewAt(quoteId: string, businessId?: string) {
  const now = new Date();

  await db
    .update(quotes)
    .set({
      publicViewedAt: now,
      autoFollowUpStoppedAt: now,
    })
    .where(
      and(
        eq(quotes.id, quoteId),
        ...(businessId ? [eq(quotes.businessId, businessId)] : []),
        isNull(quotes.deletedAt),
        inArray(quotes.status, ["sent", "revision_requested", "accepted", "rejected", "expired", "voided"]),
      ),
    );

  // Notify the owner that the quote was viewed (always-on workflow default)
  if (businessId) {
    void notifyOwnerQuoteViewed(quoteId, businessId, now).catch((error) => {
      console.error("[quote.viewed] Failed to notify owner.", error);
    });
  }

  return now;
}

type RespondToPublicQuoteByTokenInput = {
  token: string;
  response: "accepted" | "rejected";
  message?: string;
  signerName?: string;
  confirmed?: boolean;
  expectedVersion: number;
};

export async function respondToPublicQuoteByToken({
  token,
  response,
  message,
  signerName,
  confirmed,
  expectedVersion,
}: RespondToPublicQuoteByTokenInput) {
  if (response === "accepted") {
    const validName = validateSignerName(signerName);
    if (!validName) {
      throw new Error(quoteAcceptanceValidationMessages.signerName);
    }
    if (confirmed !== true) {
      throw new Error(quoteAcceptanceValidationMessages.confirmation);
    }
  }
  const today = getTodayUtcDateString();
  const now = new Date();
  const nextStatus = response;

  const result = await db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        businessId: quotes.businessId,
        businessSlug: businesses.slug,
        businessName: businesses.name,
        businessPlan: businesses.plan,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        publicToken: quotes.publicToken,
        status: quotes.status,
        version: quotes.version,
        currency: quotes.currency,
        notes: quotes.notes,
        terms: quotes.terms,
        subtotalInCents: quotes.subtotalInCents,
        discountInCents: quotes.discountInCents,
        taxInCents: quotes.taxInCents,
        taxLabel: quotes.taxLabel,
        validUntil: quotes.validUntil,
        sentAt: quotes.sentAt,
        totalInCents: quotes.totalInCents,
        notifyOnQuoteResponse: businesses.notifyOnQuoteResponse,
        notifyInAppOnQuoteResponse: businesses.notifyInAppOnQuoteResponse,
        notifyPushOnQuoteResponse: businesses.notifyPushOnQuoteResponse,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(
        and(
          getQuotePublicTokenLookupCondition(token),
          isNull(quotes.deletedAt),
          isNull(quotes.archivedAt),
          isNull(businesses.deletedAt),
          isNull(businesses.archivedAt),
        ),
      )
      .limit(1)
      .for("update", { of: quotes });

    if (!existingQuote) {
      return null;
    }

    if (
      response === "accepted" &&
      expectedVersion !== existingQuote.version
    ) {
      return {
        updated: false,
        businessId: existingQuote.businessId,
        inquiryId: existingQuote.inquiryId,
        quoteId: existingQuote.id,
        businessSlug: existingQuote.businessSlug,
        quoteNumber: existingQuote.quoteNumber,
        status: existingQuote.status,
        versionMismatch: true as const,
        version: existingQuote.version,
      };
    }

    const [existingAcceptance] = await tx
      .select({
        id: quoteAcceptances.id,
        signerName: quoteAcceptances.signerName,
        acceptedAt: quoteAcceptances.acceptedAt,
        quoteVersion: quoteAcceptances.quoteVersion,
      })
      .from(quoteAcceptances)
      .where(
        and(
          eq(quoteAcceptances.quoteId, existingQuote.id),
          eq(quoteAcceptances.quoteVersion, existingQuote.version),
        ),
      )
      .limit(1);

    if (existingQuote.status === "sent" && existingQuote.validUntil < today) {
      await expireQuoteRows(tx, [
        {
          id: existingQuote.id,
          businessId: existingQuote.businessId,
          inquiryId: existingQuote.inquiryId,
          quoteNumber: existingQuote.quoteNumber,
        },
      ]);

      return {
        updated: false,
        businessId: existingQuote.businessId,
        inquiryId: existingQuote.inquiryId,
        quoteId: existingQuote.id,
        businessSlug: existingQuote.businessSlug,
        quoteNumber: existingQuote.quoteNumber,
        status: "expired" as const,
      };
    }

    if (existingQuote.status !== "sent") {
      /* Idempotency: if the quote is already accepted, return gracefully. */
      if (existingQuote.status === "accepted") {
        return {
          updated: false,
          businessId: existingQuote.businessId,
          inquiryId: existingQuote.inquiryId,
          quoteId: existingQuote.id,
          businessSlug: existingQuote.businessSlug,
          quoteNumber: existingQuote.quoteNumber,
          status: "accepted" as const,
          signerName: existingAcceptance?.signerName ?? null,
          acceptedAt: existingAcceptance?.acceptedAt ?? null,
          version: existingAcceptance?.quoteVersion ?? existingQuote.version,
        };
      }

      return {
        updated: false,
        businessId: existingQuote.businessId,
        inquiryId: existingQuote.inquiryId,
        quoteId: existingQuote.id,
        businessSlug: existingQuote.businessSlug,
        quoteNumber: existingQuote.quoteNumber,
        status: existingQuote.status,
      };
    }

    /* Retry idempotency: acceptance already recorded for this version. */
    if (nextStatus === "accepted" && existingAcceptance) {
      return {
        updated: false,
        businessId: existingQuote.businessId,
        inquiryId: existingQuote.inquiryId,
        quoteId: existingQuote.id,
        businessSlug: existingQuote.businessSlug,
        quoteNumber: existingQuote.quoteNumber,
        status: "accepted" as const,
        signerName: existingAcceptance.signerName,
        acceptedAt: existingAcceptance.acceptedAt,
        version: existingAcceptance.quoteVersion,
      };
    }

    let acceptanceId: string | null = null;
    let snapshotHash: string | null = null;
    let validSignerName: string | null = null;

    if (nextStatus === "accepted") {
      const signerNameForAcceptance = validateSignerName(signerName);
      if (!signerNameForAcceptance) {
        throw new Error(quoteAcceptanceValidationMessages.signerName);
      }
      validSignerName = signerNameForAcceptance;

      /* Server-authoritative snapshot: never trust client totals. */
      const sourceItems = await tx
        .select({
          description: quoteItems.description,
          quantity: quoteItems.quantity,
          unitPriceInCents: quoteItems.unitPriceInCents,
          lineTotalInCents: quoteItems.lineTotalInCents,
          position: quoteItems.position,
        })
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, existingQuote.id));

      const snapshot = buildAcceptanceSnapshot({
        quoteNumber: existingQuote.quoteNumber,
        quoteVersion: existingQuote.version,
        title: existingQuote.title,
        businessName: existingQuote.businessName,
        customerName: existingQuote.customerName,
        customerEmail: existingQuote.customerEmail,
        currency: existingQuote.currency,
        notes: existingQuote.notes,
        terms: existingQuote.terms,
        validUntil: existingQuote.validUntil,
        subtotalInCents: existingQuote.subtotalInCents,
        discountInCents: existingQuote.discountInCents,
        taxInCents: existingQuote.taxInCents,
        taxLabel: existingQuote.taxLabel,
        totalInCents: existingQuote.totalInCents,
        items: sourceItems,
      });
      snapshotHash = hashAcceptanceSnapshot(snapshot);
      const acceptanceRowId = newEntityId();
      const acceptanceSnapshotHash = snapshotHash;
      acceptanceId = acceptanceRowId;

      try {
        // A nested transaction issues a SAVEPOINT, so a unique-violation
        // rolls back only the insert — the outer transaction stays alive and
        // the loser can read the winner's acceptance row.
        await tx.transaction(async (nested) => {
          await nested.insert(quoteAcceptances).values({
            id: acceptanceRowId,
            businessId: existingQuote.businessId,
            quoteId: existingQuote.id,
            quoteVersion: existingQuote.version,
            signerName: signerNameForAcceptance,
            signerEmail: existingQuote.customerEmail,
            acceptanceMethod: QUOTE_ACCEPTANCE_METHOD_TYPED_NAME,
            acceptanceText: QUOTE_ACCEPTANCE_TEXT,
            acceptanceTextVersion: QUOTE_ACCEPTANCE_TEXT_VERSION,
            snapshot,
            snapshotHash: acceptanceSnapshotHash,
            acceptedAt: now,
          });
        });
      } catch (error) {
        /* Concurrent accept won the race: return the winner idempotently. */
        if (isRetryableUniqueConflict(error)) {
          const [winner] = await tx
            .select({
              id: quoteAcceptances.id,
              signerName: quoteAcceptances.signerName,
              acceptedAt: quoteAcceptances.acceptedAt,
              quoteVersion: quoteAcceptances.quoteVersion,
            })
            .from(quoteAcceptances)
            .where(eq(quoteAcceptances.quoteId, existingQuote.id))
            .limit(1);
          if (winner) {
            return {
              updated: false,
              businessId: existingQuote.businessId,
              inquiryId: existingQuote.inquiryId,
              quoteId: existingQuote.id,
              businessSlug: existingQuote.businessSlug,
              quoteNumber: existingQuote.quoteNumber,
              status: "accepted" as const,
              signerName: winner.signerName,
              acceptedAt: winner.acceptedAt,
              version: winner.quoteVersion,
            };
          }
        }
        throw error;
      }
    }

    // Conditional transition: only a quote that is still `sent` may change
    // state. Without the predicate a concurrent decline could overwrite an
    // accepted quote, leaving an acceptance record next to a rejected status.
    const transitioned = await tx
      .update(quotes)
      .set({
        status: nextStatus,
        sentAt: existingQuote.sentAt ?? now,
        acceptedAt: nextStatus === "accepted" ? now : null,
        customerRespondedAt: now,
        customerResponseMessage: message?.trim() || null,
        autoFollowUpStoppedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(quotes.id, existingQuote.id),
          eq(quotes.businessId, existingQuote.businessId),
          eq(quotes.status, "sent"),
        ),
      )
      .returning({ id: quotes.id });

    if (transitioned.length === 0) {
      // Lost the race: the quote already moved on. Report its current state.
      const [current] = await tx
        .select({ status: quotes.status })
        .from(quotes)
        .where(eq(quotes.id, existingQuote.id))
        .limit(1);

      return {
        updated: false,
        businessId: existingQuote.businessId,
        inquiryId: existingQuote.inquiryId,
        quoteId: existingQuote.id,
        businessSlug: existingQuote.businessSlug,
        quoteNumber: existingQuote.quoteNumber,
        status: current?.status ?? existingQuote.status,
      };
    }

    if (nextStatus === "accepted") {
      await maybeMoveInquiryToWon(
        tx,
        existingQuote.businessId,
        existingQuote.inquiryId,
        now,
      );

      await onQuoteAccepted(
        tx,
        existingQuote.businessId,
        existingQuote.id,
        existingQuote.inquiryId,
        existingQuote.quoteNumber,
        now,
      );
    }

    await insertQuoteActivity(tx, {
      businessId: existingQuote.businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId: existingQuote.id,
      actorUserId: null,
      type:
        nextStatus === "accepted"
          ? "quote.customer_accepted"
          : "quote.customer_rejected",
      summary:
        nextStatus === "accepted"
          ? `Customer accepted quote ${existingQuote.quoteNumber}.`
          : `Customer declined quote ${existingQuote.quoteNumber}.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        response: nextStatus,
        customerMessage: message?.trim() || null,
        ...(nextStatus === "accepted"
          ? {
              signerName: validSignerName,
              quoteVersion: existingQuote.version,
              acceptanceId,
              snapshotHash,
            }
          : null),
      },
      now,
    });

    if (nextStatus === "accepted") {
      await writeAuditLog(tx, {
        businessId: existingQuote.businessId,
        actorUserId: null,
        actorName: validSignerName,
        entityType: "quote",
        entityId: existingQuote.id,
        action: "quote.accepted",
        metadata: {
          quoteNumber: existingQuote.quoteNumber,
          quoteVersion: existingQuote.version,
          acceptanceId,
          signerName: validSignerName,
          snapshotHash,
        },
        createdAt: now,
      });
    }

    if (existingQuote.notifyInAppOnQuoteResponse) {
      await insertBusinessNotification(tx, {
        businessId: existingQuote.businessId,
        inquiryId: existingQuote.inquiryId,
        quoteId: existingQuote.id,
        type:
          nextStatus === "accepted"
            ? "quote_customer_accepted"
            : "quote_customer_rejected",
        title:
          nextStatus === "accepted"
            ? `${existingQuote.customerName} accepted ${existingQuote.quoteNumber}`
            : `${existingQuote.customerName} declined ${existingQuote.quoteNumber}`,
        summary: truncateNotificationMessage(message, 140) ?? existingQuote.title,
        metadata: {
          customerEmail: existingQuote.customerEmail,
          customerMessage: message?.trim() || null,
          customerName: existingQuote.customerName,
          quoteNumber: existingQuote.quoteNumber,
          response: nextStatus,
          title: existingQuote.title,
          ...(nextStatus === "accepted"
            ? { signerName: validSignerName, quoteVersion: existingQuote.version }
            : null),
        },
        now,
      });
    }

    return {
      updated: true,
      businessId: existingQuote.businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId: existingQuote.id,
      businessSlug: existingQuote.businessSlug,
      businessPlan: existingQuote.businessPlan,
      businessName: existingQuote.businessName,
      customerName: existingQuote.customerName,
      customerEmail: existingQuote.customerEmail,
      customerResponseMessage: message?.trim() || null,
      notifyOnQuoteResponse: existingQuote.notifyOnQuoteResponse,
      notifyPushOnQuoteResponse: existingQuote.notifyPushOnQuoteResponse,
      publicToken: tryResolveStoredQuotePublicToken(existingQuote),
      quoteNumber: existingQuote.quoteNumber,
      status: nextStatus,
      title: existingQuote.title,
      totalInCents: existingQuote.totalInCents,
      updatedAt: now,
      signerName: nextStatus === "accepted" ? validSignerName : null,
      acceptanceId,
      version: existingQuote.version,
      acceptedAt: nextStatus === "accepted" ? now : null,
    };
  });

  // Auto-close pending follow-ups for this quote when the customer responds.
  // Runs AFTER the response transaction commits, in its own transaction: if
  // auto-close fails, the quote response should still succeed. Running it
  // inside the outer transaction deadlocks — its follow-up row locks
  // conflict with the outer transaction's pending follow-up updates.
  if (result?.updated) {
    try {
      await autoCloseFollowUpsForQuote({
        businessId: result.businessId,
        quoteId: result.quoteId,
        reason: result.status === "accepted" ? "quote_accepted" : "quote_rejected",
      });
    } catch (error) {
      console.error(
        "[respondToPublicQuoteByToken] Failed to auto-close follow-ups",
        error,
      );
    }
  }

  return result;
}

async function maybeSkipSalesFollowUps(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  quoteId: string,
  now: Date,
) {
  const pendingSalesFollowUps = await tx
    .select({ id: followUps.id, title: followUps.title })
    .from(followUps)
    .where(
      and(
        eq(followUps.businessId, businessId),
        eq(followUps.quoteId, quoteId),
        eq(followUps.status, "pending"),
        eq(followUps.category, "sales"),
      ),
    );

  if (!pendingSalesFollowUps.length) {
    return 0;
  }

  await tx
    .update(followUps)
    .set({
      status: "skipped",
      skippedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(followUps.businessId, businessId),
        eq(followUps.quoteId, quoteId),
        eq(followUps.status, "pending"),
        eq(followUps.category, "sales"),
      ),
    );

  return pendingSalesFollowUps.length;
}

export async function onQuoteAccepted(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  quoteId: string,
  inquiryId: string | null,
  quoteNumber: string,
  now: Date,
) {
  const skippedCount = await maybeSkipSalesFollowUps(
    tx,
    businessId,
    quoteId,
    now,
  );

  // Commercial schedule acceptance snapshot (P5): the editable schedule
  // becomes immutable truth with re-verified cents. Throws on incoherence —
  // acceptance must never snapshot a broken schedule.
  const [acceptedQuote] = await tx
    .select({ totalInCents: quotes.totalInCents })
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
    .limit(1);

  if (acceptedQuote) {
    const { acceptScheduleForQuote } = await import("@/features/payment-schedules/mutations");
    await acceptScheduleForQuote(tx, {
      businessId,
      quoteId,
      quoteTotalCents: acceptedQuote.totalInCents,
      now,
    });
  }

  if (skippedCount > 0) {
    await insertQuoteActivity(tx, {
      businessId,
      inquiryId,
      quoteId,
      type: "follow_up.auto_skipped_on_acceptance",
      summary: `${skippedCount} sales follow-up${skippedCount > 1 ? "s" : ""} skipped after customer accepted.`,
      metadata: { quoteNumber, skippedCount },
      now,
    });
  }
}

type CancelAcceptedQuoteForBusinessInput = {
  businessId: string;
  quoteId: string;
  actorUserId: string;
  cancellationReason: string;
  cancellationNote?: string;
};

export async function cancelAcceptedQuoteForBusiness({
  businessId,
  quoteId,
  actorUserId,
  cancellationReason,
  cancellationNote,
}: CancelAcceptedQuoteForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        deletedAt: quotes.deletedAt,
        businessId: businesses.id,
        title: quotes.title,
        customerName: quotes.customerName,
        totalInCents: quotes.totalInCents,
        currency: quotes.currency,
        completedAt: quotes.completedAt,
        canceledAt: quotes.canceledAt,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote || existingQuote.deletedAt) {
      return null;
    }

    if (existingQuote.status !== "accepted") {
      return {
        updated: false,
        locked: true,
        reason: "not_accepted",
        quoteNumber: existingQuote.quoteNumber,
      } as const;
    }

    if (existingQuote.completedAt) {
      return {
        updated: false,
        locked: true,
        reason: "already_completed",
        quoteNumber: existingQuote.quoteNumber,
      } as const;
    }

    if (existingQuote.canceledAt) {
      return {
        updated: false,
        locked: false,
        reason: "already_canceled",
        quoteNumber: existingQuote.quoteNumber,
      } as const;
    }

    /* Quote status stays 'accepted' — postAcceptanceStatus tracks cancellation. */
    await tx
      .update(quotes)
      .set({
        canceledAt: now,
        canceledBy: actorUserId,
        cancellationReason,
        cancellationNote: cancellationNote?.trim() || null,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    /* Move inquiry to lost. */
    if (existingQuote.inquiryId) {
      await tx
        .update(inquiries)
        .set({
          status: "lost",
          updatedAt: now,
        })
        .where(
          and(
            eq(inquiries.id, existingQuote.inquiryId),
            eq(inquiries.businessId, businessId),
            eq(inquiries.status, "won"),
          ),
        );
    }

    /* Skip pending post-win follow-ups. */
    await tx
      .update(followUps)
      .set({
        status: "skipped",
        skippedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(followUps.businessId, businessId),
          eq(followUps.quoteId, quoteId),
          eq(followUps.status, "pending"),
          eq(followUps.category, "post_win"),
        ),
      );

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.canceled_after_acceptance",
      summary: `Accepted quote ${existingQuote.quoteNumber} canceled: ${cancellationReason.replace(/_/g, " ")}.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        cancellationReason,
        cancellationNote: cancellationNote?.trim() || null,
      },
      now,
    });

    await writeAuditLog(tx, {
      businessId: existingQuote.businessId,
      actorUserId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.canceled_after_acceptance",
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        title: existingQuote.title,
        customerName: existingQuote.customerName,
        cancellationReason,
      },
      createdAt: now,
    });

    return {
      updated: true,
      locked: false,
      inquiryId: existingQuote.inquiryId,
      quoteNumber: existingQuote.quoteNumber,
    };
  });
}

type CompleteAcceptedQuoteForBusinessInput = {
  businessId: string;
  quoteId: string;
  actorUserId: string;
};

export async function completeAcceptedQuoteForBusiness({
  businessId,
  quoteId,
  actorUserId,
}: CompleteAcceptedQuoteForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        deletedAt: quotes.deletedAt,
        businessId: businesses.id,
        title: quotes.title,
        customerName: quotes.customerName,
        totalInCents: quotes.totalInCents,
        currency: quotes.currency,
        completedAt: quotes.completedAt,
        canceledAt: quotes.canceledAt,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote || existingQuote.deletedAt) {
      return null;
    }

    if (existingQuote.status !== "accepted") {
      return {
        updated: false,
        locked: true,
        reason: "not_accepted",
        quoteNumber: existingQuote.quoteNumber,
      } as const;
    }

    if (existingQuote.canceledAt) {
      return {
        updated: false,
        locked: true,
        reason: "already_canceled",
        quoteNumber: existingQuote.quoteNumber,
      } as const;
    }

    if (existingQuote.completedAt) {
      return {
        updated: false,
        locked: false,
        reason: "already_completed",
        quoteNumber: existingQuote.quoteNumber,
      } as const;
    }

    await tx
      .update(quotes)
      .set({
        completedAt: now,
        completedBy: actorUserId,
        updatedAt: now,
      })
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));

    /* Complete pending post-win follow-ups. */
    await tx
      .update(followUps)
      .set({
        status: "completed",
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(followUps.businessId, businessId),
          eq(followUps.quoteId, quoteId),
          eq(followUps.status, "pending"),
          eq(followUps.category, "post_win"),
        ),
      );

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.work_completed",
      summary: `Work completed for quote ${existingQuote.quoteNumber}.`,
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
      },
      now,
    });

    await writeAuditLog(tx, {
      businessId: existingQuote.businessId,
      actorUserId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote.work_completed",
      metadata: {
        quoteNumber: existingQuote.quoteNumber,
        title: existingQuote.title,
        customerName: existingQuote.customerName,
      },
      createdAt: now,
    });

    return {
      updated: true,
      locked: false,
      inquiryId: existingQuote.inquiryId,
      quoteNumber: existingQuote.quoteNumber,
    };
  });
}

// ---------------------------------------------------------------------------
// Quote Revision Requests
// ---------------------------------------------------------------------------

import { quoteVersions, quoteRevisionRequests } from "@/lib/db/schema/quotes";
import { asc } from "drizzle-orm";

type RequestQuoteRevisionByTokenInput = {
  token: string;
  message?: string;
  itemComments?: Array<{
    itemId: string;
    itemDescription: string;
    comment: string;
  }>;
};

export async function requestQuoteRevisionByToken({
  token,
  message,
  itemComments = [],
}: RequestQuoteRevisionByTokenInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        businessId: quotes.businessId,
        businessSlug: businesses.slug,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        version: quotes.version,
        validUntil: quotes.validUntil,
        customerName: quotes.customerName,
        inquiryId: quotes.inquiryId,
        deletedAt: quotes.deletedAt,
        businessPlan: businesses.plan,
        notifyOnQuoteResponse: businesses.notifyOnQuoteResponse,
        notifyInAppOnQuoteResponse: businesses.notifyInAppOnQuoteResponse,
        notifyPushOnQuoteResponse: businesses.notifyPushOnQuoteResponse,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(
        and(
          getQuotePublicTokenLookupCondition(token),
          isNull(quotes.deletedAt),
          isNull(quotes.archivedAt),
          isNull(businesses.deletedAt),
          isNull(businesses.archivedAt),
        ),
      )
      .limit(1)
      .for("update", { of: quotes });

    if (!existingQuote) {
      return null;
    }

    // An expired quote cannot be revived. Mirror the accept path: expire it
    // first, then refuse.
    if (existingQuote.status === "sent" && existingQuote.validUntil < getTodayUtcDateString()) {
      await expireQuoteRows(tx, [
        {
          id: existingQuote.id,
          businessId: existingQuote.businessId,
          inquiryId: existingQuote.inquiryId,
          quoteNumber: existingQuote.quoteNumber,
        },
      ]);

      return {
        updated: false,
        status: "expired" as const,
        quoteNumber: existingQuote.quoteNumber,
        businessId: existingQuote.businessId,
        businessSlug: existingQuote.businessSlug,
        quoteId: existingQuote.id,
        inquiryId: existingQuote.inquiryId,
        customerName: existingQuote.customerName,
        businessPlan: existingQuote.businessPlan,
        notifyPushOnQuoteResponse: existingQuote.notifyPushOnQuoteResponse,
      };
    }

    // Only allow revision requests on sent or revision_requested quotes
    if (existingQuote.status !== "sent" && existingQuote.status !== "revision_requested") {
      return {
        updated: false,
        status: existingQuote.status,
        quoteNumber: existingQuote.quoteNumber,
        businessId: existingQuote.businessId,
        businessSlug: existingQuote.businessSlug,
        quoteId: existingQuote.id,
        inquiryId: existingQuote.inquiryId,
        customerName: existingQuote.customerName,
        businessPlan: existingQuote.businessPlan,
        notifyPushOnQuoteResponse: existingQuote.notifyPushOnQuoteResponse,
      };
    }

    // Idempotency: a duplicate submit must not create a second pending
    // request (and a second owner notification) for the same version.
    const [pendingRevision] = await tx
      .select({ id: quoteRevisionRequests.id })
      .from(quoteRevisionRequests)
      .where(
        and(
          eq(quoteRevisionRequests.quoteId, existingQuote.id),
          eq(quoteRevisionRequests.version, existingQuote.version),
          eq(quoteRevisionRequests.status, "pending"),
        ),
      )
      .limit(1);

    if (pendingRevision) {
      return {
        updated: false,
        status: "revision_requested" as const,
        quoteNumber: existingQuote.quoteNumber,
        businessId: existingQuote.businessId,
        businessSlug: existingQuote.businessSlug,
        quoteId: existingQuote.id,
        inquiryId: existingQuote.inquiryId,
        customerName: existingQuote.customerName,
        businessPlan: existingQuote.businessPlan,
        notifyPushOnQuoteResponse: existingQuote.notifyPushOnQuoteResponse,
      };
    }

    // Create the revision request
    const revisionId = newEntityId();
    await tx.insert(quoteRevisionRequests).values({
      id: revisionId,
      businessId: existingQuote.businessId,
      quoteId: existingQuote.id,
      version: existingQuote.version,
      message: message?.trim() || null,
      itemComments: itemComments.length > 0 ? itemComments : [],
      status: "pending",
      createdAt: now,
    });

    // Update quote status to revision_requested
    await tx
      .update(quotes)
      .set({
        status: "revision_requested",
        updatedAt: now,
      })
      .where(
        and(
          eq(quotes.id, existingQuote.id),
          eq(quotes.businessId, existingQuote.businessId),
          inArray(quotes.status, ["sent", "revision_requested"]),
        ),
      );

    // Log activity
    await insertQuoteActivity(tx, {
      businessId: existingQuote.businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId: existingQuote.id,
      actorUserId: null,
      type: "quote.revision_requested",
      summary: `${existingQuote.customerName} requested changes to quote ${existingQuote.quoteNumber}.`,
      metadata: {
        version: existingQuote.version,
        hasMessage: Boolean(message?.trim()),
        itemCommentCount: itemComments.length,
      },
      now,
    });

    // Create in-app notification
    if (existingQuote.notifyInAppOnQuoteResponse) {
      await insertBusinessNotification(tx, {
        businessId: existingQuote.businessId,
        quoteId: existingQuote.id,
        type: "quote_revision_requested",
        title: "Revision requested",
        summary: `${existingQuote.customerName} requested changes to ${existingQuote.quoteNumber}.`,
        metadata: {
          quoteNumber: existingQuote.quoteNumber,
          customerName: existingQuote.customerName,
          message: truncateNotificationMessage(message),
        },
        now,
      });
    }

    return {
      updated: true,
      status: "revision_requested" as const,
      quoteNumber: existingQuote.quoteNumber,
      businessId: existingQuote.businessId,
      businessSlug: existingQuote.businessSlug,
      quoteId: existingQuote.id,
      inquiryId: existingQuote.inquiryId,
      customerName: existingQuote.customerName,
      businessPlan: existingQuote.businessPlan,
      notifyPushOnQuoteResponse: existingQuote.notifyPushOnQuoteResponse,
    };
  });
}

/**
 * Archives the current quote state as a version snapshot, bumps the version,
 * and resets the status to draft so the owner can edit and re-send.
 */
type ArchiveQuoteVersionAndReviseInput = {
  businessId: string;
  quoteId: string;
  actorUserId: string;
};

export async function archiveQuoteVersionAndRevise({
  businessId,
  quoteId,
  actorUserId,
}: ArchiveQuoteVersionAndReviseInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingQuote] = await tx
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        version: quotes.version,
        status: quotes.status,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        customerContactMethod: quotes.customerContactMethod,
        customerContactHandle: quotes.customerContactHandle,
        currency: quotes.currency,
        notes: quotes.notes,
        terms: quotes.terms,
        subtotalInCents: quotes.subtotalInCents,
        discountInCents: quotes.discountInCents,
        taxInCents: quotes.taxInCents,
        taxLabel: quotes.taxLabel,
        totalInCents: quotes.totalInCents,
        validUntil: quotes.validUntil,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
      })
      .from(quotes)
      .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
      .limit(1);

    if (!existingQuote || existingQuote.deletedAt || existingQuote.archivedAt) {
      return null;
    }

    // Only revision_requested or sent quotes can be revised
    if (existingQuote.status !== "revision_requested" && existingQuote.status !== "sent") {
      return {
        revised: false,
        locked: true,
        status: existingQuote.status,
      } as const;
    }

    // Get current items to archive
    const currentItems = await tx
      .select({
        id: quoteItems.id,
        description: quoteItems.description,
        quantity: quoteItems.quantity,
        unitPriceInCents: quoteItems.unitPriceInCents,
        lineTotalInCents: quoteItems.lineTotalInCents,
        position: quoteItems.position,
      })
      .from(quoteItems)
      .where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.businessId, businessId)))
      .orderBy(asc(quoteItems.position));

    // Archive current version
    const { listScopeBlocksForQuote } = await import("@/features/scope-blocks/queries");
    const versionBlocks = await listScopeBlocksForQuote({ businessId, quoteId });

    await tx.insert(quoteVersions).values({
      id: newEntityId(),
      businessId,
      quoteId,
      version: existingQuote.version,
      title: existingQuote.title,
      customerName: existingQuote.customerName,
      customerEmail: existingQuote.customerEmail,
      customerContactMethod: existingQuote.customerContactMethod,
      customerContactHandle: existingQuote.customerContactHandle,
      currency: existingQuote.currency,
      notes: existingQuote.notes,
      terms: existingQuote.terms,
      subtotalInCents: existingQuote.subtotalInCents,
      discountInCents: existingQuote.discountInCents,
      taxInCents: existingQuote.taxInCents,
      taxLabel: existingQuote.taxLabel,
      totalInCents: existingQuote.totalInCents,
      validUntil: existingQuote.validUntil,
      items: currentItems,
      scopeBlocks: versionBlocks.map((block) => ({
        id: block.id,
        kind: block.kind,
        position: block.position,
        content: block.content,
        required: block.required,
        state: block.state,
      })),
      createdAt: now,
      archivedAt: now,
    });

    // Resolve any pending revision requests
    await tx
      .update(quoteRevisionRequests)
      .set({ status: "resolved", resolvedAt: now })
      .where(
        and(
          eq(quoteRevisionRequests.quoteId, quoteId),
          eq(quoteRevisionRequests.status, "pending"),
        ),
      );

    // Bump version and reset to draft
    const nextVersion = existingQuote.version + 1;
    await tx
      .update(quotes)
      .set({
        version: nextVersion,
        status: "draft",
        sentAt: null,
        acceptedAt: null,
        customerRespondedAt: null,
        customerResponseMessage: null,
        publicViewedAt: null,
        // The customer has not seen this version yet, so the follow-up
        // sequence starts fresh when the new version is sent.
        autoFollowUpStoppedAt: null,
        autoFollowUpLastSentAt: null,
        updatedAt: now,
      })
      .where(eq(quotes.id, quoteId));

    await insertQuoteActivity(tx, {
      businessId,
      inquiryId: existingQuote.inquiryId,
      quoteId,
      actorUserId,
      type: "quote.revised",
      summary: `Quote ${existingQuote.quoteNumber} moved to v${nextVersion} for revision.`,
      metadata: {
        previousVersion: existingQuote.version,
        newVersion: nextVersion,
      },
      now,
    });

    return {
      revised: true,
      locked: false,
      status: "draft" as const,
      previousVersion: existingQuote.version,
      newVersion: nextVersion,
      inquiryId: existingQuote.inquiryId,
      quoteNumber: existingQuote.quoteNumber,
    };
  });
}

// ---------------------------------------------------------------------------
// Auto follow-up management
// ---------------------------------------------------------------------------

type EnableAutoFollowUpInput = {
  quoteId: string;
  delayDays: number;
  maxAttempts: number;
};

export async function enableAutoFollowUpForQuote({
  quoteId,
  delayDays,
  maxAttempts,
}: EnableAutoFollowUpInput) {
  const now = new Date();

  await db
    .update(quotes)
    .set({
      autoFollowUpEnabled: true,
      autoFollowUpDelayDays: delayDays,
      autoFollowUpMaxAttempts: maxAttempts,
      autoFollowUpAttempts: 0,
      autoFollowUpLastSentAt: null,
      autoFollowUpStoppedAt: null,
      updatedAt: now,
    })
    .where(eq(quotes.id, quoteId));
}

export async function stopAutoFollowUpForQuote({
  businessId,
  quoteId,
}: {
  businessId: string;
  quoteId: string;
}) {
  const now = new Date();

  await db
    .update(quotes)
    .set({
      autoFollowUpStoppedAt: now,
      updatedAt: now,
    })
    .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)));
}

// ---------------------------------------------------------------------------
// Bulk mutations for quote list actions
// ---------------------------------------------------------------------------

export async function bulkArchiveQuotesForBusiness({
  businessId,
  quoteIds,
  actorUserId,
}: {
  businessId: string;
  quoteIds: string[];
  actorUserId: string;
}): Promise<{ affected: number; skipped: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    // Already-archived rows count as affected (preserved contract) but
    // receive no success event, mirroring single-record unchanged semantics.
    const previousRows = await tx
      .select({ id: quotes.id, archivedAt: quotes.archivedAt })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          inArray(quotes.id, quoteIds),
          isNull(quotes.deletedAt),
        ),
      );
    const previouslyArchived = new Set(
      previousRows.filter((row) => row.archivedAt !== null).map((row) => row.id),
    );

    const result = await tx
      .update(quotes)
      .set({
        archivedAt: now,
        archivedBy: actorUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(quotes.businessId, businessId),
          inArray(quotes.id, quoteIds),
          isNull(quotes.deletedAt),
          // Drafts are deleted, not archived — the single-record path refuses
          // them, and an archived draft can no longer be deleted either.
          ne(quotes.status, "draft"),
        ),
      )
      .returning({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        validUntil: quotes.validUntil,
      });

    const newlyArchived = result.filter((row) => !previouslyArchived.has(row.id));

    if (newlyArchived.length > 0) {
      for (const row of newlyArchived) {
        const effectiveStatus = getStoredEffectiveQuoteStatus(
          row.status as QuoteStatus,
          row.validUntil,
        );
        await insertQuoteActivity(tx, {
          businessId,
          inquiryId: row.inquiryId,
          quoteId: row.id,
          actorUserId,
          type: "quote.archived",
          summary: `Quote ${row.quoteNumber} archived.`,
          metadata: {
            quoteNumber: row.quoteNumber,
            status: effectiveStatus,
          },
          now,
        });

        await writeAuditLog(tx, {
          businessId,
          actorUserId,
          entityType: "quote",
          entityId: row.id,
          action: "quote.archived",
          metadata: {
            quoteNumber: row.quoteNumber,
            status: effectiveStatus,
          },
          createdAt: now,
        });
      }
    }

    return {
      affected: result.length,
      skipped: quoteIds.length - result.length,
    };
  });
}

export async function bulkVoidQuotesForBusiness({
  businessId,
  quoteIds,
  actorUserId,
}: {
  businessId: string;
  quoteIds: string[];
  actorUserId: string;
}): Promise<{ affected: number; skipped: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    // Only "sent" quotes can be voided
    const result = await tx
      .update(quotes)
      .set({
        status: "voided",
        voidedAt: now,
        voidedBy: actorUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(quotes.businessId, businessId),
          inArray(quotes.id, quoteIds),
          eq(quotes.status, "sent"),
          isNull(quotes.deletedAt),
        ),
      )
      .returning({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
      });

    if (result.length > 0) {
      for (const row of result) {
        await insertQuoteActivity(tx, {
          businessId,
          inquiryId: row.inquiryId,
          quoteId: row.id,
          actorUserId,
          type: "quote.voided",
          summary: `Quote ${row.quoteNumber} voided.`,
          metadata: {
            quoteNumber: row.quoteNumber,
          },
          now,
        });

        await writeAuditLog(tx, {
          businessId,
          actorUserId,
          entityType: "quote",
          entityId: row.id,
          action: "quote.voided",
          metadata: {
            quoteNumber: row.quoteNumber,
            title: row.title,
            customerName: row.customerName,
          },
          createdAt: now,
        });
      }
    }

    return {
      affected: result.length,
      skipped: quoteIds.length - result.length,
    };
  });
}

export async function bulkDeleteDraftQuotesForBusiness({
  businessId,
  quoteIds,
  actorUserId,
}: {
  businessId: string;
  quoteIds: string[];
  actorUserId: string;
}): Promise<{ affected: number; skipped: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    // Only draft, non-archived quotes can be deleted
    const result = await tx
      .update(quotes)
      .set({
        deletedAt: now,
        deletedBy: actorUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(quotes.businessId, businessId),
          inArray(quotes.id, quoteIds),
          eq(quotes.status, "draft"),
          isNull(quotes.archivedAt),
          isNull(quotes.deletedAt),
        ),
      )
      .returning({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
      });

    if (result.length > 0) {
      for (const row of result) {
        await insertQuoteActivity(tx, {
          businessId,
          inquiryId: row.inquiryId,
          quoteId: row.id,
          actorUserId,
          type: "quote.deleted_draft",
          summary: `Draft quote ${row.quoteNumber} deleted.`,
          metadata: {
            quoteNumber: row.quoteNumber,
          },
          now,
        });

        await writeAuditLog(tx, {
          businessId,
          actorUserId,
          entityType: "quote",
          entityId: row.id,
          action: "quote.draft_deleted",
          metadata: {
            quoteNumber: row.quoteNumber,
            title: row.title,
            customerName: row.customerName,
          },
          createdAt: now,
        });
      }
    }

    return {
      affected: result.length,
      skipped: quoteIds.length - result.length,
    };
  });
}

export async function bulkRestoreQuotesForBusiness({
  businessId,
  quoteIds,
  actorUserId,
}: {
  businessId: string;
  quoteIds: string[];
  actorUserId: string;
}): Promise<{ affected: number; skipped: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const result = await tx
      .update(quotes)
      .set({
        archivedAt: null,
        archivedBy: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(quotes.businessId, businessId),
          inArray(quotes.id, quoteIds),
          isNotNull(quotes.archivedAt),
          isNull(quotes.deletedAt),
        ),
      )
      .returning({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        validUntil: quotes.validUntil,
      });

    if (result.length > 0) {
      for (const row of result) {
        const effectiveStatus = getStoredEffectiveQuoteStatus(
          row.status as QuoteStatus,
          row.validUntil,
        );
        await insertQuoteActivity(tx, {
          businessId,
          inquiryId: row.inquiryId,
          quoteId: row.id,
          actorUserId,
          type: "quote.unarchived",
          summary: `Quote ${row.quoteNumber} restored to active.`,
          metadata: {
            quoteNumber: row.quoteNumber,
            status: effectiveStatus,
          },
          now,
        });

        await writeAuditLog(tx, {
          businessId,
          actorUserId,
          entityType: "quote",
          entityId: row.id,
          action: "quote.unarchived",
          metadata: {
            quoteNumber: row.quoteNumber,
            status: effectiveStatus,
          },
          createdAt: now,
        });
      }
    }

    return {
      affected: result.length,
      skipped: quoteIds.length - result.length,
    };
  });
}
