import type { DashboardQuoteDetail } from "@/features/quotes/types";

export type QuoteDocumentData = {
  businessName: string;
  quoteNumber: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  currency: string;
  validUntil: string;
  notes: string | null;
  terms: string | null;
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  taxLabel: string | null;
  totalInCents: number;
  items: DashboardQuoteDetail["items"];
};

export function getQuoteDocumentData({
  businessName,
  quote,
}: {
  businessName: string;
  quote: DashboardQuoteDetail;
}): QuoteDocumentData {
  return {
    businessName,
    quoteNumber: quote.quoteNumber,
    title: quote.title,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail,
    customerContactMethod: quote.customerContactMethod,
    customerContactHandle: quote.customerContactHandle,
    currency: quote.currency,
    validUntil: quote.validUntil,
    notes: quote.notes,
    terms: quote.terms,
    subtotalInCents: quote.subtotalInCents,
    discountInCents: quote.discountInCents,
    taxInCents: quote.taxInCents,
    taxLabel: quote.taxLabel,
    totalInCents: quote.totalInCents,
    items: quote.items,
  };
}
