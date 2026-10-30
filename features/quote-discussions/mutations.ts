import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { insertBusinessNotification } from "@/features/notifications/mutations";
import { getQuotePublicTokenLookupCondition } from "@/features/quotes/token-storage";
import {
  getUtcDateString,
  isTerminalQuoteStatus,
  normalizeQuoteDiscussionSenderName,
  validateQuoteDiscussionMessageBody,
  validateQuoteDiscussionSenderName,
} from "@/features/quote-discussions/utils";
import { db } from "@/lib/db/client";
import {
  businesses,
  quoteDiscussionMessages,
  quoteDiscussionReads,
  quoteDiscussions,
  quotes,
} from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Marks every existing thread for the given quotes read-only. Safe to call on
 * every terminal transition; only unarchived rows are touched.
 */
export async function archiveQuoteDiscussionsForQuoteIds(
  tx: DbTransaction,
  quoteIds: readonly string[],
  now = new Date(),
) {
  if (quoteIds.length === 0) {
    return;
  }

  await tx
    .update(quoteDiscussions)
    .set({ archivedAt: now, updatedAt: now })
    .where(
      and(
        inArray(quoteDiscussions.quoteId, [...new Set(quoteIds)]),
        isNull(quoteDiscussions.archivedAt),
      ),
    );
}

function isQuoteClosedForDiscussion(quote: {
  status: string;
  validUntil: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
  businessArchivedAt: Date | null;
  businessDeletedAt: Date | null;
}) {
  const today = getUtcDateString();

  return (
    quote.status === "draft" ||
    quote.archivedAt !== null ||
    quote.deletedAt !== null ||
    quote.businessArchivedAt !== null ||
    quote.businessDeletedAt !== null ||
    isTerminalQuoteStatus(quote.status) ||
    (quote.status === "sent" && quote.validUntil < today)
  );
}

/**
 * Only terminal states need the persisted archive marker. Draft, archived,
 * and deleted quotes already derive closure from the quote row, and writing a
 * marker there would leave the thread archived after the quote reopens.
 */
function shouldPersistDiscussionArchive(quote: {
  status: string;
  validUntil: string;
}) {
  return (
    isTerminalQuoteStatus(quote.status) ||
    (quote.status === "sent" &&
      quote.validUntil < getUtcDateString())
  );
}

export type PublicQuoteDiscussionSendResult =
  | {
      ok: true;
      discussionId: string;
      messageId: string;
      businessId: string;
      businessSlug: string;
      businessName: string;
      quoteId: string;
      quoteNumber: string;
      customerName: string;
      customerEmail: string | null;
    }
  | { ok: false; reason: "not_found" | "closed" };

/**
 * Creates the thread on the first customer message and appends subsequent
 * ones to the same row. The quote row lock serializes concurrent first
 * messages, and the unique quote index is the final duplicate guard.
 */
export async function sendPublicQuoteDiscussionMessage({
  token,
  senderName,
  body,
  guestSessionHash,
}: {
  token: string;
  senderName: string;
  body: string;
  guestSessionHash: string | null;
}): Promise<PublicQuoteDiscussionSendResult> {
  const validatedName = validateQuoteDiscussionSenderName(senderName);

  if (!validatedName.ok) {
    throw new Error(validatedName.error);
  }

  const validatedBody = validateQuoteDiscussionMessageBody(body);

  if (!validatedBody.ok) {
    throw new Error(validatedBody.error);
  }

  const now = new Date();

  return db.transaction(async (tx) => {
    const [quote] = await tx
      .select({
        id: quotes.id,
        businessId: quotes.businessId,
        businessSlug: businesses.slug,
        businessName: businesses.name,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        status: quotes.status,
        validUntil: quotes.validUntil,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
        businessArchivedAt: businesses.archivedAt,
        businessDeletedAt: businesses.deletedAt,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(
        and(
          getQuotePublicTokenLookupCondition(token),
          isNull(quotes.deletedAt),
          isNull(businesses.deletedAt),
        ),
      )
      .limit(1)
      .for("update", { of: quotes });

    if (!quote) {
      return { ok: false, reason: "not_found" } as const;
    }

    if (isQuoteClosedForDiscussion(quote)) {
      if (shouldPersistDiscussionArchive(quote)) {
        await archiveQuoteDiscussionsForQuoteIds(tx, [quote.id], now);
      }
      return { ok: false, reason: "closed" } as const;
    }

    // A reopened quote clears the archive marker so the same thread resumes.
    const [discussion] = await tx
      .insert(quoteDiscussions)
      .values({
        id: newEntityId(),
        businessId: quote.businessId,
        quoteId: quote.id,
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: quoteDiscussions.quoteId,
        set: {
          archivedAt: null,
          lastMessageAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: quoteDiscussions.id });

    if (!discussion) {
      throw new Error("The quote discussion could not be created.");
    }

    const messageId = newEntityId();

    await tx.insert(quoteDiscussionMessages).values({
      id: messageId,
      businessId: quote.businessId,
      discussionId: discussion.id,
      senderType: "customer",
      senderUserId: null,
      senderName: validatedName.body,
      body: validatedBody.body,
      guestSessionHash,
      createdAt: now,
    });

    await tx
      .update(quoteDiscussions)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(
        and(
          eq(quoteDiscussions.id, discussion.id),
          eq(quoteDiscussions.businessId, quote.businessId),
        ),
      );

    const preview = validatedBody.body.slice(0, 160);

    await insertBusinessNotification(tx, {
      businessId: quote.businessId,
      quoteId: quote.id,
      type: "quote_discussion_message",
      title: `New message on ${quote.quoteNumber}`,
      summary: `${validatedName.body}: ${preview}`,
      metadata: {
        discussionId: discussion.id,
        quoteNumber: quote.quoteNumber,
      },
      now,
    });

    return {
      ok: true,
      discussionId: discussion.id,
      messageId,
      businessId: quote.businessId,
      businessSlug: quote.businessSlug,
      businessName: quote.businessName,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
    } as const;
  });
}

export type BusinessQuoteDiscussionSendResult =
  | {
      ok: true;
      discussionId: string;
      messageId: string;
      businessId: string;
      businessSlug: string;
      businessName: string;
      quoteId: string;
      quoteNumber: string;
      quoteStatus: string;
      customerName: string;
      customerEmail: string | null;
      publicToken: string | null;
    }
  | { ok: false; reason: "not_found" | "closed" };

export async function sendBusinessQuoteDiscussionMessage({
  businessId,
  discussionId,
  actorUserId,
  senderName,
  body,
}: {
  businessId: string;
  discussionId: string;
  actorUserId: string;
  senderName: string;
  body: string;
}): Promise<BusinessQuoteDiscussionSendResult> {
  const validatedName = validateQuoteDiscussionSenderName(senderName);

  if (!validatedName.ok) {
    throw new Error(validatedName.error);
  }

  const validatedBody = validateQuoteDiscussionMessageBody(body);

  if (!validatedBody.ok) {
    throw new Error(validatedBody.error);
  }

  const now = new Date();

  return db.transaction(async (tx) => {
    const [discussionRow] = await tx
      .select({
        id: quoteDiscussions.id,
        quoteId: quoteDiscussions.quoteId,
        businessId: quoteDiscussions.businessId,
      })
      .from(quoteDiscussions)
      .where(
        and(
          eq(quoteDiscussions.id, discussionId),
          eq(quoteDiscussions.businessId, businessId),
        ),
      )
      .limit(1);

    if (!discussionRow) {
      return { ok: false, reason: "not_found" } as const;
    }

    // Lock the quote before reading its state so a concurrent terminal
    // transition cannot interleave between the check and the insert.
    const [quote] = await tx
      .select({
        id: quotes.id,
        businessId: quotes.businessId,
        businessSlug: businesses.slug,
        businessName: businesses.name,
        quoteNumber: quotes.quoteNumber,
        status: quotes.status,
        validUntil: quotes.validUntil,
        archivedAt: quotes.archivedAt,
        deletedAt: quotes.deletedAt,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        publicToken: quotes.publicToken,
        businessArchivedAt: businesses.archivedAt,
        businessDeletedAt: businesses.deletedAt,
      })
      .from(quotes)
      .innerJoin(businesses, eq(quotes.businessId, businesses.id))
      .where(
        and(
          eq(quotes.id, discussionRow.quoteId),
          eq(quotes.businessId, businessId),
        ),
      )
      .limit(1)
      .for("update", { of: quotes });

    if (!quote) {
      return { ok: false, reason: "not_found" } as const;
    }

    if (isQuoteClosedForDiscussion(quote)) {
      if (shouldPersistDiscussionArchive(quote)) {
        await archiveQuoteDiscussionsForQuoteIds(tx, [quote.id], now);
      }
      return { ok: false, reason: "closed" } as const;
    }

    const [lockedDiscussion] = await tx
      .select({ id: quoteDiscussions.id })
      .from(quoteDiscussions)
      .where(
        and(
          eq(quoteDiscussions.id, discussionId),
          eq(quoteDiscussions.businessId, businessId),
        ),
      )
      .limit(1)
      .for("update");

    if (!lockedDiscussion) {
      return { ok: false, reason: "not_found" } as const;
    }

    const messageId = newEntityId();

    await tx.insert(quoteDiscussionMessages).values({
      id: messageId,
      businessId,
      discussionId,
      senderType: "business",
      senderUserId: actorUserId,
      senderName: validatedName.body,
      body: validatedBody.body,
      createdAt: now,
    });

    await tx
      .update(quoteDiscussions)
      .set({ archivedAt: null, lastMessageAt: now, updatedAt: now })
      .where(
        and(
          eq(quoteDiscussions.id, discussionId),
          eq(quoteDiscussions.businessId, businessId),
        ),
      );

    return {
      ok: true,
      discussionId,
      messageId,
      businessId,
      businessSlug: quote.businessSlug,
      businessName: quote.businessName,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      quoteStatus: quote.status,
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
      publicToken: quote.publicToken,
    } as const;
  });
}

export async function markQuoteDiscussionRead({
  businessId,
  discussionId,
  userId,
  readThrough,
  now = new Date(),
}: {
  businessId: string;
  discussionId: string;
  userId: string;
  /** The last message timestamp the member actually saw. */
  readThrough: Date;
  now?: Date;
}): Promise<{ ok: boolean }> {
  // Never advance past "now", so a forged or clock-skewed timestamp cannot
  // hide messages that have already been stored.
  const watermark = readThrough < now ? readThrough : now;

  return db.transaction(async (tx) => {
    // The write must prove the discussion belongs to this business. A prior
    // authorization read is not enough because the row is keyed by the
    // discussion id alone.
    const [discussion] = await tx
      .select({ id: quoteDiscussions.id })
      .from(quoteDiscussions)
      .where(
        and(
          eq(quoteDiscussions.id, discussionId),
          eq(quoteDiscussions.businessId, businessId),
        ),
      )
      .limit(1);

    if (!discussion) {
      return { ok: false } as const;
    }

    await tx
      .insert(quoteDiscussionReads)
      .values({
        id: newEntityId(),
        businessId,
        discussionId,
        userId,
        lastReadAt: watermark,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          quoteDiscussionReads.discussionId,
          quoteDiscussionReads.userId,
        ],
        set: {
          lastReadAt: sql`greatest(${quoteDiscussionReads.lastReadAt}, ${watermark})`,
          updatedAt: now,
        },
      });

    return { ok: true } as const;
  });
}

export { normalizeQuoteDiscussionSenderName };
