import "server-only";

import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { withCircuitBreaker } from "@/lib/db/circuit-breaker";
import {
  getBusinessFollowUpPath,
  getBusinessInquiryPath,
  getBusinessInvoicePath,
  getBusinessQuoteLibraryPath,
  getBusinessQuotePath,
  getBusinessServicePath,
} from "@/features/businesses/routes";
import { services } from "@/lib/db/schema/services";
import { followUps } from "@/lib/db/schema/follow-ups";
import { inquiries } from "@/lib/db/schema/inquiries";
import { invoices } from "@/lib/db/schema/invoices";
import { quoteLibraryEntries } from "@/lib/db/schema/quote-library";
import { quotes } from "@/lib/db/schema/quotes";

export type MobileSearchResultType =
  | "inquiry"
  | "quote"
  | "invoice"
  | "quote-library"
  | "service"
  | "follow-up";

export type MobileSearchResult = {
  id: string;
  type: MobileSearchResultType;
  title: string;
  subtitle: string | null;
  href: string;
};

const MAX_QUERY_LENGTH = 80;
const LIMIT_PER_TYPE = 5;

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function normalizeMobileSearchQuery(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");

  if (trimmed.length < 1 || trimmed.length > MAX_QUERY_LENGTH) {
    return null;
  }

  return trimmed;
}

export async function searchMobileRecordsForBusiness({
  businessId,
  businessSlug,
  query,
}: {
  businessId: string;
  businessSlug: string;
  query: string;
}): Promise<MobileSearchResult[]> {
  const normalized = normalizeMobileSearchQuery(query);

  if (!normalized) {
    return [];
  }

  const pattern = `%${escapeLikePattern(normalized)}%`;
  const quoteLibraryPath = getBusinessQuoteLibraryPath(businessSlug);

  const [inquiryRows, quoteRows, invoiceRows, quoteLibraryRows, serviceRows, followUpRows] =
    await Promise.all([
      withCircuitBreaker(`mobile-search:inquiries:${businessId}`, () =>
        db
          .select({
            id: inquiries.id,
            customerName: inquiries.customerName,
            customerEmail: inquiries.customerEmail,
            subject: inquiries.subject,
            details: inquiries.details,
          })
          .from(inquiries)
          .where(
            and(
              eq(inquiries.businessId, businessId),
              isNull(inquiries.deletedAt),
              or(
                ilike(inquiries.customerName, pattern),
                ilike(inquiries.customerEmail, pattern),
                ilike(inquiries.subject, pattern),
                ilike(inquiries.details, pattern),
              ),
            ),
          )
          .orderBy(desc(inquiries.createdAt))
          .limit(LIMIT_PER_TYPE),
      ),
      withCircuitBreaker(`mobile-search:quotes:${businessId}`, () =>
        db
          .select({
            id: quotes.id,
            quoteNumber: quotes.quoteNumber,
            title: quotes.title,
            customerName: quotes.customerName,
            customerEmail: quotes.customerEmail,
          })
          .from(quotes)
          .where(
            and(
              eq(quotes.businessId, businessId),
              isNull(quotes.deletedAt),
              or(
                ilike(quotes.title, pattern),
                ilike(quotes.quoteNumber, pattern),
                ilike(quotes.customerName, pattern),
                ilike(quotes.customerEmail, pattern),
              ),
            ),
          )
          .orderBy(desc(quotes.createdAt))
          .limit(LIMIT_PER_TYPE),
      ),
      withCircuitBreaker(`mobile-search:invoices:${businessId}`, () =>
        db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            title: invoices.title,
            customerName: invoices.customerName,
          })
          .from(invoices)
          .where(
            and(
              eq(invoices.businessId, businessId),
              isNull(invoices.deletedAt),
              or(
                ilike(invoices.title, pattern),
                ilike(invoices.invoiceNumber, pattern),
                ilike(invoices.customerName, pattern),
              ),
            ),
          )
          .orderBy(desc(invoices.createdAt))
          .limit(LIMIT_PER_TYPE),
      ),
      withCircuitBreaker(`mobile-search:quote-library:${businessId}`, () =>
        db
          .select({
            id: quoteLibraryEntries.id,
            name: quoteLibraryEntries.name,
            description: quoteLibraryEntries.description,
          })
          .from(quoteLibraryEntries)
          .where(
            and(
              eq(quoteLibraryEntries.businessId, businessId),
              or(
                ilike(quoteLibraryEntries.name, pattern),
                ilike(quoteLibraryEntries.description, pattern),
              ),
            ),
          )
          .orderBy(desc(quoteLibraryEntries.updatedAt))
          .limit(LIMIT_PER_TYPE),
      ),
      withCircuitBreaker(`mobile-search:services:${businessId}`, () =>
        db
          .select({
            id: services.id,
            name: services.name,
            slug: services.slug,
          })
          .from(services)
          .where(
            and(
              eq(services.businessId, businessId),
              isNull(services.archivedAt),
              or(
                ilike(services.name, pattern),
                ilike(services.slug, pattern),
              ),
            ),
          )
          .orderBy(desc(services.updatedAt))
          .limit(LIMIT_PER_TYPE),
      ),
      withCircuitBreaker(`mobile-search:follow-ups:${businessId}`, () =>
        db
          .select({
            id: followUps.id,
            title: followUps.title,
            reason: followUps.reason,
          })
          .from(followUps)
          .where(
            and(
              eq(followUps.businessId, businessId),
              isNull(followUps.deletedAt),
              or(
                ilike(followUps.title, pattern),
                ilike(followUps.reason, pattern),
              ),
            ),
          )
          .orderBy(desc(followUps.updatedAt))
          .limit(LIMIT_PER_TYPE),
      ),
    ]);

  return [
    ...inquiryRows.map(
      (row): MobileSearchResult => ({
        id: row.id,
        type: "inquiry",
        title: row.customerName,
        subtitle: row.subject ?? row.customerEmail,
        href: getBusinessInquiryPath(businessSlug, row.id),
      }),
    ),
    ...quoteRows.map(
      (row): MobileSearchResult => ({
        id: row.id,
        type: "quote",
        title: row.title,
        subtitle: `${row.quoteNumber} · ${row.customerName}`,
        href: getBusinessQuotePath(businessSlug, row.id),
      }),
    ),
    ...invoiceRows.map(
      (row): MobileSearchResult => ({
        id: row.id,
        type: "invoice",
        title: row.title,
        subtitle: `${row.invoiceNumber} · ${row.customerName}`,
        href: getBusinessInvoicePath(businessSlug, row.id),
      }),
    ),
    ...quoteLibraryRows.map(
      (row): MobileSearchResult => ({
        id: row.id,
        type: "quote-library",
        title: row.name,
        subtitle: row.description,
        href: quoteLibraryPath,
      }),
    ),
    ...serviceRows.map(
      (row): MobileSearchResult => ({
        id: row.id,
        type: "service",
        title: row.name,
        subtitle: `/${row.slug}`,
        href: getBusinessServicePath(businessSlug, row.slug),
      }),
    ),
    ...followUpRows.map(
      (row): MobileSearchResult => ({
        id: row.id,
        type: "follow-up",
        title: row.title,
        subtitle: row.reason,
        href: getBusinessFollowUpPath(businessSlug, row.id),
      }),
    ),
  ];
}
