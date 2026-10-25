import type { Metadata } from "next";
import { Briefcase } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DashboardEmptyState, DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { ManagerBodySkeleton } from "@/components/shell/settings-body-skeletons";
import { Button } from "@/components/ui/button";
import { createManualInquiryAction } from "@/features/inquiries/actions";
import { ManualInquiryEditor } from "@/features/inquiries/components/manual-inquiry-editor";
import { getPublicInquiryAttachmentHelpText } from "@/features/inquiries/plan-rules";
import { getInquiryEditorServicesForBusiness } from "@/features/inquiries/queries";
import { getBusinessServicesPath } from "@/features/businesses/routes";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createNoIndexMetadata } from "@/lib/seo/site";

type NewInquiryPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "New inquiry",
  description: "Quick-add an inquiry captured outside of a public service page.",
});

export const instant = true;

/**
 * New inquiry page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, searchParams, getAppShellContext, form queries) are
 * pushed into a `<Suspense>`-wrapped child server component so the shell paints
 * instantly on client navigation. Failures reach the dashboard segment
 * `error.tsx` retry card.
 */
export default function NewInquiryPage({
  params,
  searchParams,
}: NewInquiryPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        eyebrow="New inquiry"
        title="Quick-add inquiry"
        description="Capture the essentials from a call, chat, walk-in, or forwarded message. You can add deeper intake details later."
      />
      <Suspense fallback={<ManagerBodySkeleton />}>
        <NewInquiryContent params={params} searchParams={searchParams} />
      </Suspense>
    </DashboardPage>
  );
}

async function NewInquiryContent({
  params,
  searchParams,
}: NewInquiryPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { businessContext } = await getAppShellContext(businessSlug);
  const services = await getInquiryEditorServicesForBusiness(
    businessContext.business.id,
  );

  const requestedServiceSlug = Array.isArray(resolvedSearchParams.form)
    ? resolvedSearchParams.form[0]
    : resolvedSearchParams.form;
  const initialServiceSlug =
    (requestedServiceSlug &&
      services.find((service) => service.slug === requestedServiceSlug)?.slug) ??
    services[0]?.slug;
  const uploadHelpText = getPublicInquiryAttachmentHelpText(businessContext.business.plan);

  if (!initialServiceSlug) {
    return (
      <DashboardEmptyState
        action={
          <Button asChild>
            <Link href={getBusinessServicesPath(businessSlug)} prefetch={true}>
              Open services
            </Link>
          </Button>
        }
        description="Create or restore an active service first, then come back here to add inquiries manually."
        icon={Briefcase}
        title="No active services"
        variant="page"
      />
    );
  }

  return (
    <ManualInquiryEditor
      action={createManualInquiryAction}
      businessName={businessContext.business.name}
      businessSlug={businessContext.business.slug}
      services={services}
      initialServiceSlug={initialServiceSlug}
      uploadHelpText={uploadHelpText}
    />
  );
}
