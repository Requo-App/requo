import { sanitizeStorageFileName } from "@/lib/files";
import type { QuoteDocumentData } from "@/features/quotes/documents";

export function getQuotePdfFileName(data: QuoteDocumentData) {
  return `${sanitizeStorageFileName(data.quoteNumber, "quote")}.pdf`;
}

export function getQuotePngFileName(data: QuoteDocumentData) {
  return `${sanitizeStorageFileName(data.quoteNumber, "quote")}.png`;
}
