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
  BusinessInquiryFormEditorView,
  BusinessInquiryFormPreviewDraft,
  BusinessInquiryPagePreviewDraft,
  BusinessInquiryFormActionState,
} from "@/features/settings/types";
import { BusinessInquiryFormDangerZone } from "@/features/settings/components/business-inquiry-form-danger-zone";
import { BusinessInquiryFormForm } from "@/features/settings/components/business-inquiry-form-form";
import { BusinessInquiryFormManageCard } from "@/features/settings/components/business-inquiry-form-manage-card";
import { BusinessInquiryPreviewOverlay } from "@/features/settings/components/business-inquiry-preview-overlay";
import { BusinessInquiryPageForm } from "@/features/settings/components/business-inquiry-page-form";


type BusinessInquiryFormEditorTabsProps = {
  settings: BusinessInquiryFormEditorView;
  logoPreviewUrl: string | null;
  generalSettingsHref: string | null;
  settingsHref: string;
  previewHref: string;
  publicInquiryHref: string;
  inquiryListHref: string;
  productsHref?: string;
  isPublicLive: boolean;

  applyPresetAction: (
    state: BusinessInquiryFormActionState,
    formData: FormData,
  ) => Promise<BusinessInquiryFormActionState>;
  saveFormAction: Parameters<typeof BusinessInquiryFormForm>[0]["saveAction"];
  updatePageAction: Parameters<typeof BusinessInquiryPageForm>[0]["action"];

  duplicateAction: Parameters<typeof BusinessInquiryFormManageCard>[0]["duplicateAction"];
  setDefaultAction: Parameters<typeof BusinessInquiryFormManageCard>[0]["setDefaultAction"];
  togglePublicAction: Parameters<typeof BusinessInquiryFormManageCard>[0]["togglePublicAction"];


  archiveAction: Parameters<typeof BusinessInquiryFormDangerZone>[0]["archiveAction"];
  deleteAction: Parameters<typeof BusinessInquiryFormDangerZone>[0]["deleteAction"];
};

type BusinessInquiryFormEditorSection = "fields" | "page" | "publishing";

const editorSections: Array<{
  id: BusinessInquiryFormEditorSection;
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

function isEditorSection(value: string | null): value is BusinessInquiryFormEditorSection {
  return value === "fields" || value === "page" || value === "publishing";
}

function getEditorSectionValue(searchParams: ReadonlyURLSearchParams) {
  const section = searchParams.get("section");
  return isEditorSection(section) ? section : "page";
}

export function BusinessInquiryFormEditorTabs({
  settings,
  logoPreviewUrl,
  generalSettingsHref,
  settingsHref,
  previewHref,
  publicInquiryHref,
  inquiryListHref,
  productsHref,
  isPublicLive,
  applyPresetAction,
  saveFormAction,
  updatePageAction,
  duplicateAction,
  setDefaultAction,
  togglePublicAction,
  archiveAction,
  deleteAction,
}: BusinessInquiryFormEditorTabsProps) {
  const searchParams = useSearchParams();
  const activeSectionFromUrl = getEditorSectionValue(searchParams);
  const [activeSectionOverride, setActiveSectionOverride] =
    useState<BusinessInquiryFormEditorSection | null>(null);
  const activeSection = activeSectionOverride ?? activeSectionFromUrl;
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [formDraft, setFormDraft] = useState(() =>
    createFormPreviewDraft(settings),
  );
  const [pageDraft, setPageDraft] = useState(() =>
    createPagePreviewDraft(settings),
  );
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
    (nextDraft: BusinessInquiryFormPreviewDraft) => {
      setFormDraft(nextDraft);
    },
    [],
  );
  const handlePageDraftChange = useCallback(
    (nextDraft: BusinessInquiryPagePreviewDraft) => {
      setPageDraft(nextDraft);
    },
    [],
  );

  const handleOpenPreview = useCallback(() => {
    setIsPreviewOpen(true);
  }, []);

  function handleSectionChange(nextSection: BusinessInquiryFormEditorSection) {
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
          onValueChange={(val) => handleSectionChange(val as BusinessInquiryFormEditorSection)}
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
                <BusinessInquiryFormForm
                  key={`${settings.updatedAt.getTime()}-${settings.formId}-form`}
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
            <BusinessInquiryPageForm
              key={`${settings.updatedAt.getTime()}-${settings.formId}-page`}
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

            {productsHref ? (
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
                  <Link href={productsHref}>
                    Open catalog
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col gap-5">
              <BusinessInquiryFormManageCard
                applyPresetAction={applyPresetAction}
                businessType={pageDraft.businessType}
                duplicateAction={duplicateAction}
                formId={settings.formId}
                isDefault={settings.isDefault}
                isPublicInquiryEnabled={settings.publicInquiryEnabled}
                setDefaultAction={setDefaultAction}
                togglePublicAction={togglePublicAction}
              />
              <BusinessInquiryFormDangerZone
                activeFormCount={settings.activeFormCount}
                archiveAction={archiveAction}
                deleteAction={deleteAction}
                formId={settings.formId}
                inquiryListHref={inquiryListHref}
                isDefault={settings.isDefault}
                submittedInquiryCount={settings.submittedInquiryCount}
              />
            </div>
          </section>
        </TabsContent>
      </div>

      <BusinessInquiryPreviewOverlay
        business={previewSnapshot}
        onOpenChange={setIsPreviewOpen}
        open={isPreviewOpen}
        openFormHref={isPublicLive ? publicInquiryHref : previewHref}
      />
    </Tabs>
  );
}

function createFormPreviewDraft(
  settings: BusinessInquiryFormEditorView,
): BusinessInquiryFormPreviewDraft {
  return {
    businessType: settings.businessType,
    formName: settings.formName,
    formSlug: settings.formSlug,
    inquiryFormConfig: settings.inquiryFormConfig,
    inquiryPageConfig: settings.inquiryPageConfig,
  };
}

function createPagePreviewDraft(
  settings: BusinessInquiryFormEditorView,
): BusinessInquiryPagePreviewDraft {
  return {
    businessType: settings.businessType,
    formName: settings.formName,
    formSlug: settings.formSlug,
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
  formDraft: BusinessInquiryFormPreviewDraft;
  pageDraft: BusinessInquiryPagePreviewDraft;
  previewLogoUrl: string | null;
  settings: BusinessInquiryFormEditorView;
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
      id: settings.formId,
      name: pageDraft.formName,
      slug: pageDraft.formSlug,
      businessType: pageDraft.businessType,
      isDefault: settings.isDefault,
      publicInquiryEnabled: pageDraft.publicInquiryEnabled,
    },
    inquiryFormConfig: previewInquiryFormConfig,
    inquiryPageConfig: previewInquiryPageConfig,
  });
}



