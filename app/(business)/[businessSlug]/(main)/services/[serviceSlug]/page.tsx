import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageHeader } from "@/components/shared/page-header";
import { DashboardPage } from "@/components/shared/dashboard-layout";
import { DetailPageHeaderFallback } from "@/components/shared/detail-section-fallback";
import { Skeleton } from "@/components/ui/skeleton";
import {
  applyServicePresetAction,
  archiveServiceFromDetailAction,
  deleteServiceAction,
  duplicateServiceAction,
  setDefaultServiceAction,
  toggleServicePublicAction,
  updateServiceAction,
  updateServicePageAction,
} from "@/features/settings/actions";
import { ServiceEditorTabs } from "@/features/settings/components/service-editor-tabs";
import {
  getServiceEditorForBusiness,
  getServiceHeaderForBusiness,
} from "@/features/settings/queries";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import {
  getBusinessQuoteLibraryPath,
  getBusinessServicePreviewPath,
  getBusinessServicesPath,
  getBusinessSettingsPath,
} from "@/features/businesses/routes";
import { canManageBusinessAdministration } from "@/lib/business-members";
import { getDefaultBusinessSettingsPath } from "@/features/settings/navigation";
import { FormEditorTour } from "@/features/onboarding/components/form-editor-tour";
import { getAccountProfileForUser } from "@/features/account/queries";
import { requireSession } from "@/lib/auth/session";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOperationalPageContext } from "../../../settings/_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Service editor",
  description: "Manage a service's intake form, public page, and settings.",
});

export const instant = true;

type ServicePageProps = {
  params: Promise<{ businessSlug: string; serviceSlug: string }>;
};

/**
 * Service editor page — structural shell plus two staged regions.
 *
 * The header region resolves session, business context, and the slim identity
 * lookup, so the page header and its links paint without waiting on the editor
 * payload. The tabs (normalized form/page configs and form/inquiry counts)
 * stream behind their own boundary, and the onboarding tour streams last.
 * Failures reach the dashboard segment `error.tsx` retry card.
 */
export default function BusinessServicePage({ params }: ServicePageProps) {
  return (
    <DashboardPage>
      <Suspense fallback={<ServiceEditorShellFallback />}>
        <ServiceEditorHeaderRegion params={params} />
      </Suspense>
    </DashboardPage>
  );
}

function ServiceEditorTabsFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b border-border/80 pb-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-9 w-24 rounded-lg" key={index} />
        ))}
      </div>
      <div className="section-panel animate-pulse">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-6 w-32 rounded-md" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-3">
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
            <div className="grid gap-3">
              <Skeleton className="h-4 w-24 rounded-md" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ServiceEditorShellFallback() {
  return (
    <>
      <DetailPageHeaderFallback />
      <ServiceEditorTabsFallback />
    </>
  );
}

async function ServiceEditorHeaderRegion({ params }: ServicePageProps) {
  const { businessSlug, serviceSlug } = await params;
  // Resolve the business from the route slug, not the active-business cookie,
  // so the editor always matches the URL it was opened from.
  const [session, { businessContext }] = await Promise.all([
    requireSession(),
    getBusinessOperationalPageContext(businessSlug),
  ]);
  const header = await getServiceHeaderForBusiness(
    businessContext.business.id,
    serviceSlug,
  );

  if (!header) {
    notFound();
  }

  const logoPreviewUrl = header.logoStoragePath
    ? `/api/business/logo?v=${header.updatedAt.getTime()}`
    : null;
  const previewHref = getBusinessServicePreviewPath(header.slug, header.serviceSlug);
  const inquiryListHref = getBusinessServicesPath(header.slug);
  const generalSettingsHref = canManageBusinessAdministration(businessContext.role)
    ? getBusinessSettingsPath(header.slug, "general")
    : null;
  const settingsHref = getDefaultBusinessSettingsPath(
    header.slug,
    businessContext.role,
  );
  const publicInquiryHref = header.isDefault
    ? getBusinessPublicInquiryUrl(header.slug)
    : getBusinessPublicInquiryUrl(header.slug, header.serviceSlug);

  return (
    <>
      <PageHeader
        eyebrow="Services"
        title={header.serviceName}
        description="Manage this service's intake form, public page, and settings."
      />

      <Suspense fallback={<ServiceEditorTabsFallback />}>
        <ServiceEditorTabsRegion
          businessId={businessContext.business.id}
          serviceSlug={serviceSlug}
          logoPreviewUrl={logoPreviewUrl}
          generalSettingsHref={generalSettingsHref}
          settingsHref={settingsHref}
          previewHref={previewHref}
          publicInquiryHref={publicInquiryHref}
          inquiryListHref={inquiryListHref}
          quoteLibraryHref={getBusinessQuoteLibraryPath(header.slug)}
          isPublicLive={header.publicInquiryEnabled}
          canPublish={businessContext.role === "owner"}
        />
      </Suspense>

      <Suspense fallback={null}>
        <FormEditorTourSection userId={session.user.id} />
      </Suspense>
    </>
  );
}

type ServiceEditorTabsRegionProps = {
  businessId: string;
  serviceSlug: string;
  logoPreviewUrl: string | null;
  generalSettingsHref: string | null;
  settingsHref: string;
  previewHref: string;
  publicInquiryHref: string;
  inquiryListHref: string;
  quoteLibraryHref: string;
  isPublicLive: boolean;
  canPublish: boolean;
};

async function ServiceEditorTabsRegion({
  businessId,
  serviceSlug,
  ...frame
}: ServiceEditorTabsRegionProps) {
  const settings = await getServiceEditorForBusiness(
    businessId,
    serviceSlug,
  );

  if (!settings) {
    notFound();
  }

  return (
    <ServiceEditorTabs
      key={settings.serviceId}
      settings={settings}
      {...frame}
      applyPresetAction={applyServicePresetAction.bind(
        null,
        settings.serviceSlug,
      )}
      saveFormAction={updateServiceAction.bind(null, settings.serviceSlug)}
      updatePageAction={updateServicePageAction.bind(null, settings.serviceSlug)}
      duplicateAction={duplicateServiceAction}
      setDefaultAction={setDefaultServiceAction}
      togglePublicAction={toggleServicePublicAction}
      archiveAction={archiveServiceFromDetailAction}
      deleteAction={deleteServiceAction}
    />
  );
}

async function FormEditorTourSection({ userId }: { userId: string }) {
  const profile = await getAccountProfileForUser(userId);
  const showTour = Boolean(profile && !profile.formEditorTourCompletedAt);

  return <FormEditorTour show={showTour} />;
}
