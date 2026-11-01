import {
  DashboardDetailHeader,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { ErrorStateNotice } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { RegionErrorRetryButton } from "@/components/shared/region-error-boundary";

type RegionErrorStateProps = {
  message?: string;
  className?: string;
};

/**
 * Inline error notice for a failed page region.
 *
 * Shares the error-state notice with lazy-chunk failures, renders
 * `role="alert"` immediately and, when mounted by `RegionErrorBoundary`, a
 * retry button that calls Next's `retry()`.
 */
export function RegionErrorState({
  message = "Something went wrong while loading this content.",
  className,
}: RegionErrorStateProps) {
  return (
    <ErrorStateNotice
      actions={<RegionErrorRetryButton />}
      className={className}
      description={message}
    />
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
        eyebrow="Error"
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
        eyebrow="Error"
        title="This page couldn't be loaded"
      />
    </div>
  );
}
