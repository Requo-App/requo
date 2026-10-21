import { sanitizeStorageFileName } from "@/lib/files";
import { PdfReport } from "@/lib/pdf/report";
import { formatQuoteDate, formatQuoteMoney } from "@/features/quotes/utils";
import type { PaymentDetailView } from "@/features/invoices/types";
import { getVoidReasonLabel } from "@/features/invoices/void-reasons";

export type PaymentReceiptData = {
  businessName: string;
  paymentNumber: string;
  invoiceNumber: string;
  invoiceTitle: string;
  customerName: string;
  amountInCents: number;
  currency: string;
  methodLabel: string;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  recordedBy: string | null;
  recordedAt: Date;
  invoiceTotalInCents: number;
  invoicePaidInCents: number;
  invoiceBalanceInCents: number;
  status: "recorded" | "voided";
  voidReasonLabel: string | null;
};

export function getPaymentReceiptData({
  businessName,
  payment,
  methodLabel,
}: {
  businessName: string;
  payment: PaymentDetailView;
  methodLabel: string;
}): PaymentReceiptData {
  return {
    businessName,
    paymentNumber: payment.paymentNumber,
    invoiceNumber: payment.invoiceNumber,
    invoiceTitle: payment.invoiceTitle,
    customerName: payment.customerName,
    amountInCents: payment.amountInCents,
    currency: payment.currency,
    methodLabel,
    paymentDate: payment.paymentDate,
    reference: payment.reference,
    notes: payment.notes,
    recordedBy: payment.recordedByName,
    recordedAt: payment.createdAt,
    invoiceTotalInCents: payment.invoiceTotalInCents,
    invoicePaidInCents: payment.invoicePaidInCents,
    invoiceBalanceInCents: payment.invoiceBalanceInCents,
    status: payment.voidedAt ? "voided" : "recorded",
    voidReasonLabel: payment.voidedAt ? getVoidReasonLabel(payment.voidReason) : null,
  };
}

export async function createPaymentReceiptPdf(data: PaymentReceiptData) {
  const report = await PdfReport.create(`Payment receipt ${data.paymentNumber}`);
  const pageRight = report.pageWidth - report.margin;

  report.drawWrappedText(data.businessName, { font: report.boldFont, size: 16, gapAfter: 0 });

  const label = "PAYMENT RECEIPT";
  const labelWidth = report.boldFont.widthOfTextAtSize(label, 24);
  const labelY = report.y + 20;
  report.page.drawText(label, {
    x: pageRight - labelWidth,
    y: labelY,
    font: report.boldFont,
    size: 24,
    color: report.colors.text,
  });
  report.y -= 28;

  report.drawWrappedText("Payment recorded in Requo. This is a business payment record, not a tax receipt.", {
    font: report.bodyFont,
    size: 9,
    color: report.colors.muted,
    gapAfter: 12,
  });

  function row(labelText: string, valueText: string, bold = false) {
    report.ensureSpace(20);
    const rowY = report.y - 12;
    const font = bold ? report.boldFont : report.bodyFont;
    report.page.drawText(labelText, { x: report.margin, y: rowY, font: report.bodyFont, size: 10, color: report.colors.muted });
    const valWidth = font.widthOfTextAtSize(valueText, 10);
    report.page.drawText(valueText, { x: pageRight - valWidth, y: rowY, font, size: 10, color: report.colors.text });
    report.y -= 18;
  }

  row("Payment number:", data.paymentNumber, true);
  row("Status:", data.status === "voided" ? "Voided" : "Recorded", true);
  row("Amount:", formatQuoteMoney(data.amountInCents, data.currency), true);
  row("Currency:", data.currency);
  row("Payment method:", data.methodLabel);
  row("Payment date:", formatQuoteDate(data.paymentDate));
  if (data.reference) row("Reference:", data.reference);
  if (data.recordedBy) row("Recorded by:", data.recordedBy);
  row("Recorded at:", formatQuoteDate(data.recordedAt.toISOString().slice(0, 10)));
  if (data.voidReasonLabel) row("Void reason:", data.voidReasonLabel);

  report.y -= 8;
  report.drawDivider(0, 12);
  report.drawWrappedText("Invoice", { font: report.boldFont, size: 9, color: report.colors.muted, gapAfter: 4 });

  row("Invoice:", `${data.invoiceNumber} · ${data.invoiceTitle}`);
  row("Customer:", data.customerName);
  row("Invoice total:", formatQuoteMoney(data.invoiceTotalInCents, data.currency));
  row("Amount paid:", formatQuoteMoney(data.invoicePaidInCents, data.currency));
  row("Balance due:", formatQuoteMoney(data.invoiceBalanceInCents, data.currency), true);

  if (data.notes?.trim()) {
    report.y -= 8;
    report.drawWrappedText("Notes", { font: report.boldFont, size: 9, color: report.colors.muted, gapAfter: 4 });
    report.drawWrappedText(data.notes.trim().slice(0, 600), { size: 10, gapAfter: 4 });
  }

  return report.save();
}

export function getPaymentReceiptFileName(data: PaymentReceiptData) {
  return `${sanitizeStorageFileName(data.paymentNumber, "receipt")}.pdf`;
}
