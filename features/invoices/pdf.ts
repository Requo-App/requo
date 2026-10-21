import { sanitizeStorageFileName } from "@/lib/files";
import type { InvoiceDocumentData } from "@/features/invoices/documents";

export function getInvoicePdfFileName(data: InvoiceDocumentData) {
  return `${sanitizeStorageFileName(data.invoiceNumber, "invoice")}.pdf`;
}

export function getInvoicePngFileName(data: InvoiceDocumentData) {
  return `${sanitizeStorageFileName(data.invoiceNumber, "invoice")}.png`;
}
