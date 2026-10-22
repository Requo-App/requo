"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowUpRight,
  FileText,
  FormInput,
  Link2,
  Settings2,
} from "lucide-react";
import {
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { toast } from "@/components/shared/notify";

import { DashboardSidebarStack } from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { MobileTabsCombobox } from "@/components/shared/mobile-tabs-combobox";
import { createPublicInquiryPreviewBusiness } from "@/features/inquiries/preview-business";
import type { PublicInquiryBusiness } from "@/features/inquiries/types";

import type {
  ServiceEditorView,
  ServicePreviewDraft,
  ServicePagePreviewDraft,
  ServiceActionState,
} from "@/features/settings/types";
import { ServiceDangerZone } from "@/features/settings/components/service-danger-zone";
import { ServiceForm } from "@/features/settings/components/service-form";
import { ServiceManageCard } from "@/features/settings/components/service-manage-card";
import { ServicePreviewOverlay } from "@/features/settings/components/service-preview-overlay";
import { ServicePageForm } from "@/features/settings/components/service-page-form";


type ServiceEditorTabsProps = {
  settings: ServiceEditorView;
  logoPreviewUrl: string | null;
  generalSettingsHref: string | null;
  settingsHref: string;
  previewHref: string;
  publicInquiryHref: string;
  inquiryListHref: string;
  quoteLibraryHref?: string;
  isPublicLive: boolean;
  /** Publishing is an owner-level action on the server. */
  canPublish?: boolean;

  applyPresetAction: (
    state: ServiceActionState,
    formData: FormData,
  ) => Promise<ServiceActionState>;
  saveFormAction: Parameters<typeof ServiceForm>[0]["saveAction"];
  updatePageAction: Parameters<typeof ServicePageForm>[0]["action"];

  duplicateAction: Parameters<typeof ServiceManageCard>[0]["duplicateAction"];
  setDefaultAction: Parameters<typeof ServiceManageCard>[0]["setDefaultAction"];
  togglePublicAction: Parameters<typeof ServiceManageCard>[0]["togglePublicAction"];


  archiveAction: Parameters<typeof ServiceDangerZone>[0]["archiveAction"];
  deleteAction: Parameters<typeof ServiceDangerZone>[0]["deleteAction"];
};

type ServiceEditorSection = "fields" | "page" | "publishing";

const editorSections: Array<{
  id: ServiceEditorSection;
  label: string;
  icon: typeof FormInput;
}> = [
  {
    id: "page",
    label: "Service page",
    icon: FileText,
  },
  {
    id: "fields",
    label: "Form",
    icon: FormInput,
  },
  {
    id: "publishing",
    label: "Settings",
    icon: Settings2,
  },
];

function isEditorSection(value: string | null): value is ServiceEditorSection {
  return value === "fields" || value === "page" || value === "publishing";
}

function getEditorSectionValue(searchParams: ReadonlyURLSearchParams) {
  const section = searchParams.get("section");
  return isEditorSection(section) ? section : "page";
}

export function ServiceEditorTabs({
  settings,
  logoPreviewUrl,
  generalSettingsHref,
  settingsHref,
  previewHref,
  publicInquiryHref,
  inquiryListHref,
  quoteLibraryHref,
  isPublicLive,
  canPublish = true,
  applyPresetAction,
  saveFormAction,
  updatePageAction,
  duplicateAction,
  setDefaultAction,
  togglePublicAction,
  archiveAction,
  deleteAction,
}: ServiceEditorTabsProps) {
  const searchParams = useSearchParams();
  const activeSectionFromUrl = getEditorSectionValue(searchParams);
  const [activeSectionOverride, setActiveSectionOverride] =
    useState<ServiceEditorSection | null>(null);
  const activeSection = activeSectionOverride ?? activeSectionFromUrl;
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [formDraft, setFormDraft] = useState(() =>
    createFormPreviewDraft(settings),
  );
  const [pageDraft, setPageDraft] = useState(() =>
    createPagePreviewDraft(settings),
  );

  // The editor keeps local drafts so the preview can show unsaved edits.
  // Those drafts have to follow the server when the server changes them —
  // applying template defaults replaces the stored form and page config, and
  // the editor must not keep showing (or re-saving) the old values.
  //
  // The two tabs are tracked separately so saving one tab never discards
  // unsaved work in the other.
  const formServerSignature = useMemo(
    () =>
      JSON.stringify({
        inquiryFormConfig: settings.inquiryFormConfig,
        businessType: settings.businessType,
      }),
    [settings.inquiryFormConfig, settings.businessType],
  );
  const pageServerSignature = useMemo(
    () =>
      JSON.stringify({
        inquiryPageConfig: settings.inquiryPageConfig,
        businessType: settings.businessType,
        serviceName: settings.serviceName,
        serviceSlug: settings.serviceSlug,
      }),
    [
      settings.inquiryPageConfig,
      settings.businessType,
      settings.serviceName,
      settings.serviceSlug,
    ],
  );
  const [seenFormSignature, setSeenFormSignature] = useState(
    formServerSignature,
  );
  const [seenPageSignature, setSeenPageSignature] = useState(
    pageServerSignature,
  );

  // Adjust the drafts during render rather than in an effect: React re-runs
  // the component immediately, so the drafts and the server config land in
  // the same commit instead of flashing stale values first.
  if (seenFormSignature !== formServerSignature) {
    setSeenFormSignature(formServerSignature);
    setFormDraft(createFormPreviewDraft(settings));
  }

  if (seenPageSignature !== pageServerSignature) {
    setSeenPageSignature(pageServerSignature);
    setPageDraft(createPagePreviewDraft(settings));
  }
  const previewLogoUrl = useMemo(
    () =>
      settings.logoStoragePath
        ? `/api/public/businesses/${settings.slug}/logo?v=${settings.updatedAt.getTime()}`
        : null,
    [settings.logoStoragePath, settings.slug, settings.updatedAt],
  );
  const previewSnapshot = useMemo(
    () =>
      createPreviewSnapshot({
        formDraft,
        pageDraft,
        previewLogoUrl,
        settings,
      }),
    [formDraft, pageDraft, previewLogoUrl, settings],
  );

  const handleFormDraftChange = useCallback(
    (nextDraft: ServicePreviewDraft) => {
      setFormDraft(nextDraft);
    },
    [],
  );
  const handlePageDraftChange = useCallback(
    (nextDraft: ServicePagePreviewDraft) => {
      setPageDraft(nextDraft);
    },
    [],
  );

  const handleOpenPreview = useCallback(() => {
    setIsPreviewOpen(true);
  }, []);

  function handleSectionChange(nextSection: ServiceEditorSection) {
    if (nextSection === activeSection) {
      return;
    }

    setActiveSectionOverride(nextSection);
  }

  function handleTabChange(nextSection: string) {
    if (isEditorSection(nextSection)) {
      handleSectionChange(nextSection);
    }
  }

  return (
    <Tabs
      className="flex flex-col gap-5"
      onValueChange={handleTabChange}
      value={activeSection}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Mobile: combobox dropdown */}
        <MobileTabsCombobox
          groups={[{ items: editorSections.map(s => ({ label: s.label, value: s.id, icon: s.icon })) }]}
          activeValue={activeSection}
          onValueChange={(val) => handleSectionChange(val as ServiceEditorSection)}
        />

        {/* Desktop: horizontal tabs */}
        <TabsList className="hidden sm:inline-flex">
          {editorSections.map((section) => {
            const Icon = section.icon;

            return (
              <TabsTrigger
                data-tour={
                  section.id === "fields"
                    ? "form-builder"
                    : section.id === "page"
                      ? "public-page"
                      : "form-settings"
                }
                key={section.id}
                value={section.id}
              >
                <Icon className="size-4" />
                {section.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            onClick={() => {
              const url = new URL(
                isPublicLive ? publicInquiryHref : previewHref,
                window.location.origin,
              ).toString();
              navigator.clipboard.writeText(url).then(
                () => toast.success("Link copied to clipboard."),
                () => toast.error("Failed to copy link."),
              );
            }}
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            type="button"
          >
            <Link2 data-icon="inline-start" />
            Copy link
          </Button>
          <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none" type="button">
            <Link
              href={isPublicLive ? publicInquiryHref : previewHref}
              rel="noreferrer"
              target="_blank"
            >
              Open service
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="min-w-0">
        <TabsContent
          className={activeSection === "fields" ? undefined : "hidden"}
          forceMount
          value="fields"
        >
          <DashboardSidebarStack>
            <div className="flex flex-col gap-5">
                <ServiceForm
                  key={`${settings.serviceId}-form-${formServerSignature}`}
                  draft={formDraft}
                  isActive={activeSection === "fields"}
                  onDraftChange={handleFormDraftChange}
                  onPreview={handleOpenPreview}
                  saveAction={saveFormAction}
                  settings={settings}
                />
            </div>
          </DashboardSidebarStack>
        </TabsContent>

        <TabsContent
          className={activeSection === "page" ? undefined : "hidden"}
          forceMount
          value="page"
        >
          <DashboardSidebarStack>
            <ServicePageForm
              key={`${settings.serviceId}-page-${pageServerSignature}`}
              action={updatePageAction}
              generalSettingsHref={generalSettingsHref}
              logoPreviewUrl={logoPreviewUrl}
              onDraftChange={handlePageDraftChange}
              onPreview={handleOpenPreview}
              settingsHref={settingsHref}
              settings={settings}
            />
          </DashboardSidebarStack>
        </TabsContent>

        <TabsContent
          className={activeSection === "publishing" ? undefined : "hidden"}
          forceMount
          value="publishing"
        >
          <section className="flex flex-col gap-4">
            <div>
              <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                Settings
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Visibility, defaults, and lifecycle for this service.
              </p>
            </div>

            {settings.submittedInquiryCount > 0 ? (
              <div className="soft-panel flex items-center gap-4 shadow-none">
                <div className="min-w-0">
                  <p className="meta-label">Submissions</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {settings.submittedInquiryCount.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Total inquiries received through this service
                  </p>
                </div>
              </div>
            ) : null}

            {quoteLibraryHref ? (
              <div className="surface-card flex items-center justify-between gap-4 p-4 sm:p-5">
                <div className="min-w-0 space-y-1">
                  <p className="font-heading text-sm font-semibold text-foreground">
                    Pricing & Packages
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Configure reusable packages and line items in your product catalog to quote this service faster.
                  </p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={quoteLibraryHref}>
                    Open catalog
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col gap-5">
              <ServiceManageCard
                applyPresetAction={applyPresetAction}
                businessType={pageDraft.businessType}
                canPublish={canPublish}
                duplicateAction={duplicateAction}
                serviceId={settings.serviceId}
                isDefault={settings.isDefault}
                isPublicInquiryEnabled={settings.publicInquiryEnabled}
                setDefaultAction={setDefaultAction}
                togglePublicAction={togglePublicAction}
              />
              <ServiceDangerZone
                activeFormCount={settings.activeFormCount}
                archiveAction={archiveAction}
                deleteAction={deleteAction}
                serviceId={settings.serviceId}
                inquiryListHref={inquiryListHref}
                isDefault={settings.isDefault}
                submittedInquiryCount={settings.submittedInquiryCount}
              />
            </div>
          </section>
        </TabsContent>
      </div>

      <ServicePreviewOverlay
        business={previewSnapshot}
        onOpenChange={setIsPreviewOpen}
        open={isPreviewOpen}
        openFormHref={isPublicLive ? publicInquiryHref : previewHref}
      />
    </Tabs>
  );
}

function createFormPreviewDraft(
  settings: ServiceEditorView,
): ServicePreviewDraft {
  return {
    businessType: settings.businessType,
    serviceName: settings.serviceName,
    serviceSlug: settings.serviceSlug,
    inquiryFormConfig: settings.inquiryFormConfig,
    inquiryPageConfig: settings.inquiryPageConfig,
  };
}

function createPagePreviewDraft(
  settings: ServiceEditorView,
): ServicePagePreviewDraft {
  return {
    businessType: settings.businessType,
    serviceName: settings.serviceName,
    serviceSlug: settings.serviceSlug,
    publicInquiryEnabled: settings.publicInquiryEnabled,
    inquiryPageConfig: settings.inquiryPageConfig,
  };
}

function createPreviewSnapshot({
  formDraft,
  pageDraft,
  previewLogoUrl,
  settings,
}: {
  formDraft: ServicePreviewDraft;
  pageDraft: ServicePagePreviewDraft;
  previewLogoUrl: string | null;
  settings: ServiceEditorView;
}): PublicInquiryBusiness {
  const previewInquiryPageConfig = pageDraft.inquiryPageConfig;
  const previewInquiryFormConfig = {
    ...formDraft.inquiryFormConfig,
    businessType: pageDraft.businessType,
  };

  return createPublicInquiryPreviewBusiness({
    id: settings.id,
    name: settings.name,
    slug: settings.slug,
    plan: settings.plan,
    businessType: pageDraft.businessType,
    shortDescription: settings.shortDescription,
    logoUrl: previewLogoUrl,
    form: {
      id: settings.serviceId,
      name: pageDraft.serviceName,
      slug: pageDraft.serviceSlug,
      businessType: pageDraft.businessType,
      isDefault: settings.isDefault,
      publicInquiryEnabled: pageDraft.publicInquiryEnabled,
    },
    inquiryFormConfig: previewInquiryFormConfig,
    inquiryPageConfig: previewInquiryPageConfig,
  });
}



