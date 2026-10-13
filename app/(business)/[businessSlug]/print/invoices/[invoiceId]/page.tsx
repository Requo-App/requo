import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PrintPageShell } from "@/components/shared/print-page-shell";
import { getBusinessInvoicePath } from "@/features/businesses/routes";
import { InvoicePrintDocument } from "@/features/invoices/components/invoice-print-document";
import { getInvoiceForBusiness } from "@/features/invoices/queries";
import { requireExportRequestContext } from "@/lib/exports";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Invoice print",
  description: "Print-friendly view of a single invoice for business owners.",
});

const routeParamsSchema = z.object({
  invoiceId: z.string().trim().min(1).max(128),
});

type InvoicePrintPageProps = {
  params: Promise<{
    businessSlug: string;
    invoiceId: string;
  }>;
};

export default async function InvoicePrintPage({ params }: InvoicePrintPageProps) {
  const resolvedParams = await params;
  const requestContext =
    await requireExportRequestContext(resolvedParams.businessSlug);

  const parsedParams = routeParamsSchema.safeParse({ invoiceId: resolvedParams.invoiceId });

  if (!parsedParams.success) {
    notFound();
  }

  const invoice = await getInvoiceForBusiness({
    businessId: requestContext.businessContext.business.id,
    invoiceId: parsedParams.data.invoiceId,
  });

  if (!invoice) {
    notFound();
  }

  return (
    <PrintPageShell
      backHref={getBusinessInvoicePath(resolvedParams.businessSlug, invoice.id)}
      backLabel="Back to invoice"
      description="Customer-facing invoice content only. This page is cleanly printable and opens the browser print dialog automatically."
      title={`Invoice ${invoice.invoiceNumber}`}
    >
      <InvoicePrintDocument
        businessName={requestContext.businessContext.business.name}
        businessLogoStoragePath={requestContext.businessContext.business.logoStoragePath}
        businessSlug={resolvedParams.businessSlug}
        invoice={invoice}
      />
    </PrintPageShell>
  );
}
