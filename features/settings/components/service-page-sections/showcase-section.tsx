"use client";

import { Crop } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  inquiryPageShowcaseImageFrameMeta,
  inquiryPageShowcaseImageSizeMeta,
  type InquiryPageShowcaseImageCrop,
  type InquiryPageShowcaseImageFrame,
  type InquiryPageShowcaseImageSize,
} from "@/features/inquiries/page-config";
import {
  InquiryShowcaseImageSurface,
} from "@/features/inquiries/components/inquiry-showcase-image-surface";
import type { PlanTier } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

import { DisclosureSection, OptionTile, OptionTileGrid, SectionVisibilityToggle } from "./shared";

export type ShowcaseSectionProps = {
  showcaseImageUrl: string;
  showcaseImageFrame: InquiryPageShowcaseImageFrame;
  showcaseImageSize: InquiryPageShowcaseImageSize;
  showcaseImageCrop: InquiryPageShowcaseImageCrop;
  effectiveShowShowcaseImage: boolean;
  isPending: boolean;
  pageCustomizationLocked: boolean;
  plan: PlanTier;
  showcaseImageUrlError: string | undefined;
  showcaseImageFrameError: string | undefined;
  showcaseImageSizeError: string | undefined;
  cropError: string | null;
  showcaseImageCropXError: string | undefined;
  showcaseImageCropYError: string | undefined;
  showcaseImageCropZoomError: string | undefined;
  onShowcaseImageUrlChange: (value: string) => void;
  onShowcaseImageFrameChange: (value: InquiryPageShowcaseImageFrame) => void;
  onShowcaseImageSizeChange: (value: InquiryPageShowcaseImageSize) => void;
  onShowShowcaseImageChange: (nextValue: boolean) => void;
  onOpenCropDialog: () => void;
};

export function ShowcaseSection({
  showcaseImageUrl,
  showcaseImageFrame,
  showcaseImageSize,
  showcaseImageCrop,
  effectiveShowShowcaseImage,
  isPending,
  pageCustomizationLocked,
  plan,
  showcaseImageUrlError,
  showcaseImageFrameError,
  showcaseImageSizeError,
  cropError,
  showcaseImageCropXError,
  showcaseImageCropYError,
  showcaseImageCropZoomError,
  onShowcaseImageUrlChange,
  onShowcaseImageFrameChange,
  onShowcaseImageSizeChange,
  onShowShowcaseImageChange,
  onOpenCropDialog,
}: ShowcaseSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <SectionVisibilityToggle
          checked={effectiveShowShowcaseImage}
          description="Keep the image settings saved, but hide the showcase image on the public page when this is off."
          disabled={isPending || pageCustomizationLocked}
          label="Show showcase image"
          locked={pageCustomizationLocked}
          plan={plan}
          onCheckedChange={onShowShowcaseImageChange}
        />

        <Field data-invalid={Boolean(showcaseImageUrlError) || undefined}>
          <FieldLabel htmlFor="service-page-showcase-image-url">
            Image URL
          </FieldLabel>
          <FieldContent>
            <Input
              aria-invalid={Boolean(showcaseImageUrlError) || undefined}
              disabled={isPending || pageCustomizationLocked}
              id="service-page-showcase-image-url"
              maxLength={2000}
              name="showcaseImageUrlInput"
              onChange={(event) =>
                onShowcaseImageUrlChange(event.currentTarget.value)
              }
              placeholder="https://example.com/image.jpg"
              type="url"
              value={showcaseImageUrl}
            />
            <FieldDescription>
              Paste a public image URL. Leave blank to remove.
            </FieldDescription>
            <FieldError
              errors={
                showcaseImageUrlError
                  ? [{ message: showcaseImageUrlError }]
                  : undefined
              }
            />
          </FieldContent>
        </Field>

        {showcaseImageUrl.trim() ? (
          <DisclosureSection
            label="Frame, size, and crop"
            description="Fine-tune how the image displays."
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="grid gap-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  <Field data-invalid={Boolean(showcaseImageFrameError) || undefined}>
                    <FieldLabel>Frame</FieldLabel>
                    <FieldContent>
                      <OptionTileGrid>
                        {(Object.keys(
                          inquiryPageShowcaseImageFrameMeta,
                        ) as InquiryPageShowcaseImageFrame[]).map((frame) => {
                          const option = inquiryPageShowcaseImageFrameMeta[frame];
                          const isSelected = showcaseImageFrame === frame;

                          return (
                            <OptionTile
                              description={option.description}
                              disabled={isPending}
                              isSelected={isSelected}
                              key={frame}
                              label={option.label}
                              selectedLabel="Selected"
                              onClick={() => onShowcaseImageFrameChange(frame)}
                              locked={pageCustomizationLocked}
                              plan={plan}
                            />
                          );
                        })}
                      </OptionTileGrid>
                      <FieldError
                        errors={
                          showcaseImageFrameError
                            ? [{ message: showcaseImageFrameError }]
                            : undefined
                        }
                      />
                    </FieldContent>
                  </Field>

                  <Field data-invalid={Boolean(showcaseImageSizeError) || undefined}>
                    <FieldLabel>Size</FieldLabel>
                    <FieldContent>
                      <OptionTileGrid>
                        {(Object.keys(
                          inquiryPageShowcaseImageSizeMeta,
                        ) as InquiryPageShowcaseImageSize[]).map((size) => {
                          const option = inquiryPageShowcaseImageSizeMeta[size];
                          const isSelected = showcaseImageSize === size;

                          return (
                            <OptionTile
                              description={option.description}
                              disabled={isPending}
                              isSelected={isSelected}
                              key={size}
                              label={option.label}
                              selectedLabel="Selected"
                              onClick={() => onShowcaseImageSizeChange(size)}
                              locked={pageCustomizationLocked}
                              plan={plan}
                            />
                          );
                        })}
                      </OptionTileGrid>
                      <FieldError
                        errors={
                          showcaseImageSizeError
                            ? [{ message: showcaseImageSizeError }]
                            : undefined
                        }
                      />
                    </FieldContent>
                  </Field>
                </div>
              </div>

              <ShowcaseImageEditorPreview
                crop={showcaseImageCrop}
                frame={showcaseImageFrame}
                onCrop={
                  pageCustomizationLocked
                    ? undefined
                    : () => void onOpenCropDialog()
                }
                size={showcaseImageSize}
                url={showcaseImageUrl}
              />
            </div>
          </DisclosureSection>
        ) : null}

        {cropError ||
        showcaseImageCropXError ||
        showcaseImageCropYError ||
        showcaseImageCropZoomError ? (
          <div className="mt-5">
            <FieldError
              errors={[
                ...(cropError ? [{ message: cropError }] : []),
                ...(showcaseImageCropXError
                  ? [{ message: showcaseImageCropXError }]
                  : []),
                ...(showcaseImageCropYError
                  ? [{ message: showcaseImageCropYError }]
                  : []),
                ...(showcaseImageCropZoomError
                  ? [{ message: showcaseImageCropZoomError }]
                  : []),
              ]}
            />
          </div>
        ) : null}
    </div>
  );
}

function ShowcaseImageEditorPreview({
  crop,
  frame,
  onCrop,
  size,
  url,
}: {
  crop: InquiryPageShowcaseImageCrop;
  frame: InquiryPageShowcaseImageFrame;
  onCrop?: () => void;
  size: InquiryPageShowcaseImageSize;
  url: string;
}) {
  const trimmedUrl = url.trim();

  return (
 <div className="soft-panel h-full shadow-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="meta-label">Preview</p>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            Showcase image
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {trimmedUrl ? "Shown below the supporting content." : "No image added yet."}
          </p>
        </div>

        {trimmedUrl ? (
          <Button
            className="w-full sm:w-auto"
            disabled={!onCrop}
            onClick={onCrop}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Crop data-icon="inline-start" />
            Crop
          </Button>
        ) : null}
      </div>

      <div className="mt-5">
        {trimmedUrl ? (
          <InquiryShowcaseImageSurface
            alt=""
            className={cn(
              "transition-[width,max-width] duration-200",
              getShowcaseImagePreviewSizeClass(size),
            )}
            crop={crop}
            frame={frame}
            url={trimmedUrl}
          />
        ) : (
          <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-border/70 bg-[var(--surface-inset-bg)] px-6 text-center">
            <p className="text-sm leading-6 text-muted-foreground">
              Add an image URL to show a preview here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function getShowcaseImagePreviewSizeClass(size: InquiryPageShowcaseImageSize) {
  switch (size) {
    case "compact":
      return "max-w-xs";
    case "large":
      return "w-full";
    case "standard":
    default:
      return "max-w-sm";
  }
}
