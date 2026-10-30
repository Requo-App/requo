import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { getQuotePublicTokenLookupCondition } from "@/features/quotes/token-storage";
import type {
  PublicQuoteDiscussionView,
  QuoteDiscussionDetail,
  QuoteDiscussionInboxFilters,
  QuoteDiscussionInboxResult,
  QuoteDiscussionMessageView,
  QuoteDiscussionState,
  QuoteDiscussionSummary,
} from "@/features/quote-discussions/types";
import {
  getLatestCustomerMessageName,
  isQuoteDiscussionOpen,
} from "@/features/quote-discussions/utils";
import { db } from "@/lib/db/client";
import {
  businesses,
  quoteDiscussionMessages,
  quoteDiscussionReads,
  quoteDiscussions,
  quotes,
} from "@/lib/db/schema";

export const quoteDiscussionInboxPageSize = 20;

const latestMessageBody = sql<
  string | null
>`(select m.body from quote_discussion_messages m where m.discussion_id = ${quoteDiscussions.id} order by m.created_at desc, m.id desc limit 1)`;

const latestMessageSender = sql<
  string | null
>`(select m.sender_type::text from quote_discussion_messages m where m.discussion_id = ${quoteDiscussions.id} order by m.created_at desc, m.id desc limit 1)`;

const latestMessageSenderName = sql<
  string | null
>`(select m.sender_name from quote_discussion_messages m where m.discussion_id = ${quoteDiscussions.id} order by m.created_at desc, m.id desc limit 1)`;

const latestMessageCreatedAt = sql<
  Date | null
>`(select m.created_at from quote_discussion_messages m where m.discussion_id = ${quoteDiscussions.id} order by m.created_at desc, m.id desc limit 1)`.mapWith(
  quoteDiscussionMessages.createdAt,
);

const unreadCustomerMessages = sql<number>`(
  select count(*)::int from quote_discussion_messages m
  where m.discussion_id = ${quoteDiscussions.id}
    and m.sender_type = 'customer'
    and m.created_at > coalesce(${quoteDiscussionReads.lastReadAt}, 'epoch'::timestamptz)
)`;

const terminalQuoteCondition = sql`(
  ${quotes.status} in ('accepted', 'rejected', 'expired', 'voided')
  or (${quotes.status} = 'sent' and ${quotes.validUntil} < current_date)
)`;

const archivedDiscussionCondition = or(
  isNotNull(quoteDiscussions.archivedAt),
  // Archiving a quote makes its thread read-only even though the quote status
  // itself is not terminal; restoring the quote opens it again.
  isNotNull(quotes.archivedAt),
  // A draft quote is not publicly available, so an existing thread stays
  // read-only until the quote is sent again.
  sql`${quotes.status} = 'draft'`,
  terminalQuoteCondition,
)!;

const discussionStateExpression = sql<QuoteDiscussionState>`case
  when ${archivedDiscussionCondition} then 'archived'
  when ${latestMessageSender} = 'customer' then 'needs_reply'
  else 'waiting_for_customer'
end`;

type SummaryRow = {
  id: string;
  quoteId: string;
  quoteNumber: string;
  quoteStatus: string;
  quoteTotalInCents: number;
  currency: string;
  customerName: string;
  state: QuoteDiscussionState;
  lastMessageAt: Date;
  lastBody: string | null;
  lastSender: string | null;
  lastSenderName: string | null;
  lastCreatedAt: Date | null;
  unreadCount: number;
};

function toMessage(row: {
  id: string;
  senderType: string;
  senderName: string;
  body: string;
  createdAt: Date;
}): QuoteDiscussionMessageView {
  return {
    id: row.id,
    senderType: row.senderType === "business" ? "business" : "customer",
    senderName: row.senderName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

function toSummary(row: SummaryRow): QuoteDiscussionSummary {
  const lastSenderType =
    row.lastSender === "business" || row.lastSender === "customer"
      ? row.lastSender
      : null;

  return {
    id: row.id,
    quoteId: row.quoteId,
    quoteNumber: row.quoteNumber,
    quoteStatus: row.quoteStatus,
    quoteTotalInCents: row.quoteTotalInCents,
    currency: row.currency,
    customerName: row.customerName,
    state: row.state,
    unreadCount: Number(row.unreadCount ?? 0),
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessage:
      row.lastBody && row.lastCreatedAt && lastSenderType
        ? {
            senderType: lastSenderType,
            senderName: row.lastSenderName ?? "Unknown sender",
            body: row.lastBody,
            createdAt: row.lastCreatedAt.toISOString(),
          }
        : null,
  };
}

function getSummarySelection() {
  return {
    id: quoteDiscussions.id,
    quoteId: quoteDiscussions.quoteId,
    quoteNumber: quotes.quoteNumber,
    quoteStatus: quotes.status,
    quoteTotalInCents: quotes.totalInCents,
    currency: quotes.currency,
    customerName: quotes.customerName,
    state: discussionStateExpression,
    lastMessageAt: quoteDiscussions.lastMessageAt,
    lastBody: latestMessageBody,
    lastSender: latestMessageSender,
    lastSenderName: latestMessageSenderName,
    lastCreatedAt: latestMessageCreatedAt,
    unreadCount: unreadCustomerMessages,
  };
}

function getInboxStateCondition(view: QuoteDiscussionInboxFilters["view"]): SQL {
  switch (view) {
    case "archived":
      return archivedDiscussionCondition;
    case "waiting_for_customer":
      return and(
        not(archivedDiscussionCondition),
        sql`${latestMessageSender} is distinct from 'customer'`,
      )!;
    case "needs_reply":
    default:
      return and(
        not(archivedDiscussionCondition),
        sql`${latestMessageSender} = 'customer'`,
      )!;
  }
}

export async function getQuoteDiscussionInboxForBusiness({
  businessId,
  userId,
  filters,
}: {
  businessId: string;
  userId: string;
  filters: QuoteDiscussionInboxFilters;
}): Promise<QuoteDiscussionInboxResult> {
  const conditions = [
    eq(quoteDiscussions.businessId, businessId),
    isNull(quotes.deletedAt),
    isNotNull(latestMessageCreatedAt),
    getInboxStateCondition(filters.view),
  ];
  const offset = Math.max(0, (filters.page - 1) * quoteDiscussionInboxPageSize);

  const [rows, countRows] = await Promise.all([
    db
      .select(getSummarySelection())
      .from(quoteDiscussions)
      .innerJoin(quotes, eq(quoteDiscussions.quoteId, quotes.id))
      .leftJoin(
        quoteDiscussionReads,
        and(
          eq(quoteDiscussionReads.discussionId, quoteDiscussions.id),
          eq(quoteDiscussionReads.businessId, businessId),
          eq(quoteDiscussionReads.userId, userId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(quoteDiscussions.lastMessageAt), desc(quoteDiscussions.id))
      .limit(quoteDiscussionInboxPageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(quoteDiscussions)
      .innerJoin(quotes, eq(quoteDiscussions.quoteId, quotes.id))
      .leftJoin(
        quoteDiscussionReads,
        and(
          eq(quoteDiscussionReads.discussionId, quoteDiscussions.id),
          eq(quoteDiscussionReads.businessId, businessId),
          eq(quoteDiscussionReads.userId, userId),
        ),
      )
      .where(and(...conditions)),
  ]);

  return {
    items: rows.map(toSummary),
    totalCount: Number(countRows[0]?.count ?? 0),
    page: filters.page,
    pageSize: quoteDiscussionInboxPageSize,
  };
}

export async function getQuoteDiscussionDetailForBusiness({
  businessId,
  discussionId,
  userId,
}: {
  businessId: string;
  discussionId: string;
  userId: string;
}): Promise<QuoteDiscussionDetail | null> {
  const [row] = await db
    .select({
      ...getSummarySelection(),
      businessName: businesses.name,
      businessSlug: businesses.slug,
      customerEmail: quotes.customerEmail,
      validUntil: quotes.validUntil,
      discussionArchivedAt: quoteDiscussions.archivedAt,
    })
    .from(quoteDiscussions)
    .innerJoin(quotes, eq(quoteDiscussions.quoteId, quotes.id))
    .innerJoin(businesses, eq(quoteDiscussions.businessId, businesses.id))
    .leftJoin(
      quoteDiscussionReads,
      and(
        eq(quoteDiscussionReads.discussionId, quoteDiscussions.id),
        eq(quoteDiscussionReads.businessId, businessId),
        eq(quoteDiscussionReads.userId, userId),
      ),
    )
    .where(
      and(
        eq(quoteDiscussions.id, discussionId),
        eq(quoteDiscussions.businessId, businessId),
        isNull(quotes.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const messageRows = await db
    .select({
      id: quoteDiscussionMessages.id,
      senderType: quoteDiscussionMessages.senderType,
      senderName: quoteDiscussionMessages.senderName,
      body: quoteDiscussionMessages.body,
      createdAt: quoteDiscussionMessages.createdAt,
    })
    .from(quoteDiscussionMessages)
    .where(
      and(
        eq(quoteDiscussionMessages.discussionId, discussionId),
        eq(quoteDiscussionMessages.businessId, businessId),
      ),
    )
    .orderBy(
      asc(quoteDiscussionMessages.createdAt),
      asc(quoteDiscussionMessages.id),
    );

  return {
    ...toSummary(row),
    businessName: row.businessName,
    businessSlug: row.businessSlug,
    customerEmail: row.customerEmail,
    validUntil: row.validUntil,
    archivedAt: row.discussionArchivedAt?.toISOString() ?? null,
    messages: messageRows.map(toMessage),
  };
}

export async function getQuoteDiscussionForQuoteForBusiness({
  businessId,
  quoteId,
  userId,
}: {
  businessId: string;
  quoteId: string;
  userId: string;
}): Promise<QuoteDiscussionSummary | null> {
  const [row] = await db
    .select(getSummarySelection())
    .from(quoteDiscussions)
    .innerJoin(quotes, eq(quoteDiscussions.quoteId, quotes.id))
    .leftJoin(
      quoteDiscussionReads,
      and(
        eq(quoteDiscussionReads.discussionId, quoteDiscussions.id),
        eq(quoteDiscussionReads.businessId, businessId),
        eq(quoteDiscussionReads.userId, userId),
      ),
    )
    .where(
      and(
        eq(quoteDiscussions.businessId, businessId),
        eq(quoteDiscussions.quoteId, quoteId),
        isNull(quotes.deletedAt),
      ),
    )
    .limit(1);

  return row ? toSummary(row) : null;
}

export async function getPublicQuoteDiscussionByToken(
  token: string,
): Promise<PublicQuoteDiscussionView | null> {
  const [row] = await db
    .select({
      quoteId: quotes.id,
      businessId: quotes.businessId,
      quoteNumber: quotes.quoteNumber,
      customerName: quotes.customerName,
      quoteStatus: quotes.status,
      validUntil: quotes.validUntil,
      quoteArchivedAt: quotes.archivedAt,
      quoteDeletedAt: quotes.deletedAt,
      businessName: businesses.name,
      businessArchivedAt: businesses.archivedAt,
      businessDeletedAt: businesses.deletedAt,
      discussionId: quoteDiscussions.id,
      discussionArchivedAt: quoteDiscussions.archivedAt,
    })
    .from(quotes)
    .innerJoin(businesses, eq(quotes.businessId, businesses.id))
    .leftJoin(quoteDiscussions, eq(quoteDiscussions.quoteId, quotes.id))
    .where(
      and(
        getQuotePublicTokenLookupCondition(token),
        isNull(quotes.deletedAt),
        isNull(businesses.deletedAt),
      ),
    )
    .limit(1);

  if (!row || row.quoteStatus === "draft") {
    return null;
  }

  const messages = row.discussionId
    ? (
        await db
          .select({
            id: quoteDiscussionMessages.id,
            senderType: quoteDiscussionMessages.senderType,
            senderName: quoteDiscussionMessages.senderName,
            body: quoteDiscussionMessages.body,
            createdAt: quoteDiscussionMessages.createdAt,
          })
          .from(quoteDiscussionMessages)
          .where(
            and(
              eq(quoteDiscussionMessages.discussionId, row.discussionId),
              eq(quoteDiscussionMessages.businessId, row.businessId),
            ),
          )
          .orderBy(
            asc(quoteDiscussionMessages.createdAt),
            asc(quoteDiscussionMessages.id),
          )
      ).map(toMessage)
    : [];

  const archived = Boolean(
    row.discussionArchivedAt ||
      row.quoteArchivedAt ||
      row.quoteDeletedAt ||
      row.businessArchivedAt ||
      row.businessDeletedAt,
  );
  const open = isQuoteDiscussionOpen({
    status: row.quoteStatus,
    validUntil: row.validUntil,
    quoteArchived: archived,
  });

  return {
    messages,
    closed: !open,
    archived: archived || !open,
    suggestedName:
      getLatestCustomerMessageName(messages) || row.customerName || "",
    businessName: row.businessName,
    quoteNumber: row.quoteNumber,
  };
}
