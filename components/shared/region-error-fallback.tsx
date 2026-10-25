import { AlertTriangle } from "lucide-react";

import {
  DashboardDetailHeader,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { RegionErrorRetryButton } from "@/components/shared/region-error-boundary";
import { cn } from "@/lib/utils";

type RegionErrorStateProps = {
  message?: string;
  className?: string;
};

/**
 * Inline error notice for a failed page region.
 *
 * Renders `role="alert"` immediately and, when mounted by
 * `RegionErrorBoundary`, a retry button that calls Next's `retry()`.
 */
export function RegionErrorState({
  message = "Something went wrong while loading this content.",
  className,
}: RegionErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      role="alert"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-destructive"
        />
        <p className="text-sm leading-5 text-foreground">{message}</p>
      </div>
      <RegionErrorRetryButton />
    </div>
  );
}

/**
 * Error fallback for a staged detail section.
 *
 * Keeps the section heading so the failure is attributed to the feed that
 * failed rather than looking like a page that never finished loading.
 */
export function DetailSectionErrorFallback({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <DashboardSection title={title}>
      <RegionErrorState
        message={message ?? `Couldn't load ${title.toLowerCase()}.`}
      />
    </DashboardSection>
  );
}

/**
 * Error fallback for a detail page's `DashboardDetailHeader` region.
 */
export function DetailPageHeaderErrorFallback() {
  return (
    <div role="alert">
      <DashboardDetailHeader
        actions={<RegionErrorRetryButton />}
        description="Something went wrong while loading this record."
        eyebrow="Unavailable"
        title="This record couldn't be loaded"
      />
    </div>
  );
}

/**
 * Error fallback for a `PageHeader` region (invoice edit, payment receipt).
 */
export function PageHeaderErrorFallback() {
  return (
    <div role="alert">
      <PageHeader
        actions={<RegionErrorRetryButton />}
        description="Something went wrong while loading this page."
        eyebrow="Unavailable"
        title="This page couldn't be loaded"
      />
    </div>
  );
}
