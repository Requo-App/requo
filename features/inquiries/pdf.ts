import { sanitizeStorageFileName } from "@/lib/files";
import type { InquiryDocumentData } from "@/features/inquiries/documents";

/**
 * File names for the inquiry document export.
 *
 * The export itself renders the print page and rasterizes it
 * (`exportSingleDocument`), so there is no separate PDF generator here.
 */
export function getInquiryPdfFileName(data: InquiryDocumentData) {
  return `${sanitizeStorageFileName(data.referenceId, "request")}.pdf`;
}

export function getInquiryPngFileName(data: InquiryDocumentData) {
  return `${sanitizeStorageFileName(data.referenceId, "request")}.png`;
}
