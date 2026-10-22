import "server-only";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import type { CustomerHistoryData } from "@/features/customer-history/types";
import {
  getEffectiveInquiryStatus,
} from "@/features/inquiries/queries";
import {
  getEffectiveQuoteStatus,
  getNonDeletedQuoteCondition,
} from "@/features/quotes/queries";
import { hotBusinessCacheLife } from "@/lib/cache/business-tags";
import { db } from "@/lib/db/client";
import { inquiries, quotes } from "@/lib/db/schema";
import {
  getBusinessInquiryListCacheTags,
  getBusinessQuoteListCacheTags,
} from "@/lib/cache/business-tags";

const CUSTOMER_HISTORY_LIST_LIMIT = 12;

function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function getCustomerHistoryForBusiness(input: {
  businessId: string;
  customerEmail?: string | null;
  customerContactHandle?: string | null;
  excludeInquiryId?: string | null;
  excludeQuoteId?: string | null;
}): Promise<CustomerHistoryData | null> {
  const normalizedEmail = input.customerEmail ? normalizeCustomerEmail(input.customerEmail) : null;
  const normalizedHandle = input.customerContactHandle ? normalizeCustomerEmail(input.customerContactHandle) : null;

  if (!normalizedEmail && !normalizedHandle) {
    return null;
  }

  return getCachedCustomerHistoryForBusiness({
    businessId: input.businessId,
    customerEmail: normalizedEmail,
    customerContactHandle: normalizedHandle,
    excludeInquiryId: input.excludeInquiryId ?? null,
    excludeQuoteId: input.excludeQuoteId ?? null,
  });
}

async function getCachedCustomerHistoryForBusiness(input: {
  businessId: string;
  customerEmail: string | null;
  customerContactHandle: string | null;
  excludeInquiryId: string | null;
  excludeQuoteId: string | null;
}): Promise<CustomerHistoryData | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(
    ...getBusinessInquiryListCacheTags(input.businessId),
    ...getBusinessQuoteListCacheTags(input.businessId),
  );

  const inquiryConditions = [
    eq(inquiries.businessId, input.businessId),
    ];
  const quoteConditions = [
    eq(quotes.businessId, input.businessId),
    getNonDeletedQuoteCondition(),
  ];

  if (input.customerEmail) {
    inquiryConditions.push(sql`lower(${inquiries.customerEmail}) = ${input.customerEmail}`);
    quoteConditions.push(sql`lower(${quotes.customerEmail}) = ${input.customerEmail}`);
  } else if (input.customerContactHandle) {
    inquiryConditions.push(sql`lower(${inquiries.customerContactHandle}) = ${input.customerContactHandle}`);
    quoteConditions.push(sql`lower(${quotes.customerContactHandle}) = ${input.customerContactHandle}`);
  }

  if (input.excludeInquiryId) {
    inquiryConditions.push(ne(inquiries.id, input.excludeInquiryId));
  }

  if (input.excludeQuoteId) {
    quoteConditions.push(ne(quotes.id, input.excludeQuoteId));
  }

  const [inquiryCountRows, quoteCountRows, inquiryRows, quoteRows] =
    await Promise.all([
      db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(inquiries)
        .where(and(...inquiryConditions)),
      db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(quotes)
        .where(and(...quoteConditions)),
      db
        .select({
          id: inquiries.id,
          customerName: inquiries.customerName,
          customerEmail: inquiries.customerEmail,
          customerContactMethod: inquiries.customerContactMethod,
          customerContactHandle: inquiries.customerContactHandle,
          subject: inquiries.subject,
          status: getEffectiveInquiryStatus,
          submittedAt: inquiries.submittedAt,
        })
        .from(inquiries)
        .where(and(...inquiryConditions))
        .orderBy(desc(inquiries.submittedAt), desc(inquiries.createdAt))
        .limit(CUSTOMER_HISTORY_LIST_LIMIT),
      db
        .select({
          id: quotes.id,
          customerName: quotes.customerName,
          customerEmail: quotes.customerEmail,
          customerContactMethod: quotes.customerContactMethod,
          customerContactHandle: quotes.customerContactHandle,
          quoteNumber: quotes.quoteNumber,
          title: quotes.title,
          status: getEffectiveQuoteStatus,
          totalInCents: quotes.totalInCents,
          currency: quotes.currency,
          createdAt: quotes.createdAt,
        })
        .from(quotes)
        .where(and(...quoteConditions))
        .orderBy(desc(quotes.createdAt))
        .limit(CUSTOMER_HISTORY_LIST_LIMIT),
    ]);

  const inquiryCount = Number(inquiryCountRows[0]?.count ?? 0);
  const quoteCount = Number(quoteCountRows[0]?.count ?? 0);

  if (!inquiryCount && !quoteCount) {
    return null;
  }

  const latestInquiry = inquiryRows[0];
  const latestQuote = quoteRows[0];
  const latestOutcome =
    latestInquiry && latestQuote
      ? latestInquiry.submittedAt >= latestQuote.createdAt
        ? {
            kind: "inquiry" as const,
            status: latestInquiry.status,
          }
        : {
            kind: "quote" as const,
            status: latestQuote.status,
          }
      : latestQuote
        ? {
            kind: "quote" as const,
            status: latestQuote.status,
          }
        : latestInquiry
          ? {
              kind: "inquiry" as const,
              status: latestInquiry.status,
            }
          : null;

  return {
    customerEmail: input.customerEmail ?? input.customerContactHandle ?? "",
    inquiryCount,
    quoteCount,
    latestOutcome,
    inquiries: inquiryRows,
    quotes: quoteRows,
  };
}
