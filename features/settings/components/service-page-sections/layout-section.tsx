"use client";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import {
  inquiryPageMobileLayoutMeta,
  inquiryPageTemplateMeta,
  type InquiryPageMobileLayout,
  type InquiryPageTemplate,
} from "@/features/inquiries/page-config";
import { FeatureGate } from "@/features/entitlements";
import type { PlanTier } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

import { DisclosureSection, OptionTile } from "./shared";

export type LayoutSectionProps = {
  effectiveTemplate: InquiryPageTemplate;
  mobileLayout: InquiryPageMobileLayout;
  isPending: boolean;
  pageCustomizationLocked: boolean;
  plan: PlanTier;
  templateError: string | undefined;
  logoPreviewUrl: string | null;
  generalSettingsHref: string | null;
  settingsHref: string;
  businessName: string;
  onTemplateChange: (value: InquiryPageTemplate) => void;
  onMobileLayoutChange: (value: InquiryPageMobileLayout) => void;
};

export function LayoutSection({
  effectiveTemplate,
  mobileLayout,
  isPending,
  pageCustomizationLocked,
  plan,
  templateError,
  logoPreviewUrl,
  generalSettingsHref,
  settingsHref,
  businessName,
  onTemplateChange,
  onMobileLayoutChange,
}: LayoutSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-3">
          {(
            Object.keys(inquiryPageTemplateMeta) as InquiryPageTemplate[]
          ).map((templateId) => {
            const templateMeta = inquiryPageTemplateMeta[templateId];
            const isSelected = effectiveTemplate === templateId;
            const isLockedTemplate =
              pageCustomizationLocked && templateId !== "no_supporting_cards";

            const templateButton = (
              <button
                key={templateId}
                className={cn(
                  "soft-panel flex min-h-44 flex-col gap-4 text-left transition-colors",
                  isSelected
                    ? "border-primary/20 bg-accent/52"
                    : "hover:bg-accent/30",
                )}
                disabled={isPending}
                onClick={() => onTemplateChange(templateId)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold tracking-tight text-foreground">
                    {templateMeta.label}
                  </p>
                  <span className="flex items-center gap-2">
                    {isSelected ? (
                      <span className="dashboard-meta-pill min-h-0 px-3 py-1">
                        Selected
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="grid flex-1 gap-2">
                  <TemplateMiniPreview template={templateId} />
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {templateMeta.description}
                </p>
              </button>
            );

            if (isLockedTemplate) {
              return (
                <FeatureGate
                  key={templateId}
                  variant="action"
                  feature="servicePageCustomization"
                  plan={plan}
                >
                  {templateButton}
                </FeatureGate>
              );
            }

            return templateButton;
          })}
        </div>

        <div className="mt-4">
          <FieldError
            errors={templateError ? [{ message: templateError }] : undefined}
          />
        </div>

        <DisclosureSection
          label="Mobile layout"
          description="Control what customers see on phones."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              Object.keys(inquiryPageMobileLayoutMeta) as InquiryPageMobileLayout[]
            ).map((layoutId) => {
              const layoutMeta = inquiryPageMobileLayoutMeta[layoutId];
              const isSelected = mobileLayout === layoutId;

              return (
                <OptionTile
                  description={layoutMeta.description}
                  disabled={isPending}
                  isSelected={isSelected}
                  key={layoutId}
                  label={layoutMeta.label}
                  selectedLabel="Selected"
                  onClick={() => onMobileLayoutChange(layoutId)}
                />
              );
            })}
          </div>
        </DisclosureSection>

        <div className="mt-6 border-t border-border/70 pt-6" role="group" aria-label="Branding">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1">
              <p className="meta-label">Brand assets</p>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                Business brand
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Logo comes from the business profile. Add a page tagline only if you want different text here.
              </p>
            </div>

            {generalSettingsHref ? (
              <Button asChild className="w-full sm:w-auto" variant="outline">
                <Link href={generalSettingsHref}>Open business profile</Link>
              </Button>
            ) : (
              <Button asChild className="w-full sm:w-auto" variant="outline">
                <Link href={settingsHref}>Open settings</Link>
              </Button>
            )}
          </div>

          <div className="mt-4 soft-panel flex items-center gap-4 shadow-none">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[inset_0_1px_0_var(--surface-highlight)]">
              {logoPreviewUrl ? (
                <Image
                  src={logoPreviewUrl}
                  alt={`${businessName} logo`}
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
                  {getInitials(businessName)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="meta-label">Current business brand</p>
              <p className="mt-1 truncate font-heading text-xl font-semibold tracking-tight text-foreground">
                {businessName}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Update the logo and brand line from the business profile.
              </p>
            </div>
          </div>
        </div>
    </div>
  );
}

function TemplateMiniPreview({
  template,
}: {
  template: InquiryPageTemplate;
}) {
  if (template === "no_supporting_cards") {
    return (
      <div className="grid flex-1 gap-2">
        <div data-padding="none" className="soft-panel h-8 bg-secondary/70 shadow-none" />
        <div data-padding="none" className="soft-panel h-20 bg-card shadow-none" />
      </div>
    );
  }

  if (template === "showcase") {
    return (
      <div className="grid flex-1 gap-2 md:grid-cols-[0.8fr_1.2fr]">
        <div data-padding="none" className="soft-panel h-full min-h-20 bg-card shadow-none" />
        <div className="grid gap-2">
          <div data-padding="none" className="soft-panel h-10 bg-secondary/70 shadow-none" />
          <div className="grid gap-2 md:grid-cols-2">
            <div data-padding="none" className="soft-panel h-9 bg-card shadow-none" />
            <div data-padding="none" className="soft-panel h-9 bg-card shadow-none" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid flex-1 gap-2 md:grid-cols-[1.15fr_0.85fr]">
      <div className="grid gap-2">
        <div data-padding="none" className="soft-panel h-7 bg-secondary/70 shadow-none" />
        <div data-padding="none" className="soft-panel h-10 bg-card shadow-none" />
        <div data-padding="none" className="soft-panel h-10 bg-card shadow-none" />
      </div>
      <div data-padding="none" className="soft-panel h-full min-h-20 bg-card shadow-none" />
    </div>
  );
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase())
    .join("");
}
