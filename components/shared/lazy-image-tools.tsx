"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { CropperProps } from "react-easy-crop";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyErrorBoundary } from "@/components/shared/lazy-error-boundary";

/**
 * Skeleton placeholder for the image cropper component.
 * Matches the crop dialog container dimensions (100% width, min-height 26rem).
 * Adds < 2 KB JS and prevents CLS by reserving the cropper area.
 */
function CropperSkeleton() {
  return (
    <div className="relative flex min-h-[26rem] w-full items-center justify-center overflow-hidden rounded-lg bg-muted/25">
      <Skeleton className="size-48 rounded-lg" />
      {/* Crop handles hint */}
      <div className="absolute inset-8 rounded-md border-2 border-dashed border-muted-foreground/20" />
    </div>
  );
}

/**
 * Skeleton placeholder for PDF/export operations.
 * Shows a document-shaped loading area matching export preview dimensions.
 */
function PdfExportSkeleton() {
  return (
    <div className="flex min-h-[200px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-border/50 bg-muted/10 p-6">
      <Skeleton className="h-8 w-8 rounded-md" />
      <Skeleton className="h-4 w-32 rounded-sm" />
    </div>
  );
}

// ssr: false — react-easy-crop uses browser APIs (touch/pointer events, canvas 2D context) for image cropping
const InternalCropper = dynamic(
  () => import("react-easy-crop").then((mod) => mod.default),
  { ssr: false, loading: () => <CropperSkeleton /> }
);

/**
 * Lazy-loaded Cropper from react-easy-crop.
 * Only downloads the crop library when the crop dialog is rendered.
 * Wrapped in an error boundary that catches chunk download failures and
 * offers a retry button to re-attempt the import.
 *
 * Most CropperProps fields have defaultProps in the underlying component,
 * so we only require the essential ones (`crop` + `onCropChange`).
 */
export function LazyCropper(
  props: Partial<CropperProps> & Pick<CropperProps, "crop" | "onCropChange">
) {
  return (
    <LazyErrorBoundary>
      <InternalCropper {...(props as ComponentProps<typeof InternalCropper>)} />
    </LazyErrorBoundary>
  );
}

/**
 * Lazy-loaded html-to-image utilities.
 * Returns the module namespace — consumers call methods on the result.
 * Usage: const htmlToImage = await loadHtmlToImage();
 *
 * Since html-to-image is a utility module (not a React component),
 * we export a lazy loader function rather than a dynamic component.
 */
export async function loadHtmlToImage() {
  return import("html-to-image");
}

/**
 * Lazy-loaded pdf-lib utilities.
 * Since pdf-lib is a utility module (not a React component),
 * we export a lazy loader function rather than a dynamic component.
 */
export async function loadPdfLib() {
  return import("pdf-lib");
}

export { CropperSkeleton, PdfExportSkeleton };
