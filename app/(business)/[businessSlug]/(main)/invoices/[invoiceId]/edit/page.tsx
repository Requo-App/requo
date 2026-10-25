import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getBusinessInvoicePath } from "@/features/businesses/routes";
import { updateInvoiceDraftAction } from "@/features/invoices/actions";
import { EditInvoiceForm } from "@/features/invoices/components/edit-invoice-form";
import { getInvoiceForBusiness } from "@/features/invoices/queries";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createNoIndexMetadata } from "@/lib/seo/site";

type EditInvoicePageProps = {
  params: Promise<{ businessSlug: string; invoiceId: string }>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "Edit invoice",
  description: "Edit a draft invoice before it is sent.",
});

export const instant = true;

export default function EditInvoicePage({ params }: EditInvoicePageProps) {
  return (
    <DashboardPage>
      <Suspense fallback={<EditInvoiceSkeleton />}>
        <EditInvoiceContent params={params} />
      </Suspense>
    </DashboardPage>
  );
}

function EditInvoiceSkeleton() {
  return (
    <>
      <PageHeader eyebrow="Billing" title="Edit invoice" description="Loading invoice details." />
      <Skeleton className="h-[34rem] w-full" />
    </>
  );
}

async function EditInvoiceContent({ params }: EditInvoicePageProps) {
  const { businessSlug, invoiceId } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const invoice = await getInvoiceForBusiness({ businessId: businessContext.business.id, invoiceId });

  if (!invoice) {
    notFound();
  }

  if (invoice.status !== "draft") {
    redirect(getBusinessInvoicePath(businessSlug, invoice.id));
  }

  const action = updateInvoiceDraftAction.bind(null, invoice.id);

  return (
    <>
      <PageHeader
        eyebrow={`Invoice ${invoice.invoiceNumber}`}
        title="Edit invoice"
        description="Update draft details before sending. Sent invoices cannot be edited."
      />
      <EditInvoiceForm
        action={action}
        businessSlug={businessSlug}
        currency={invoice.currency}
        invoice={invoice}
      />
    </>
  );
}
