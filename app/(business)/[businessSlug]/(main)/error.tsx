"use client";

import { usePathname } from "next/navigation";

import { ErrorState } from "@/components/shared/error-state";
import { useErrorReport } from "@/components/shared/error-state-client";
import {
  homePath,
  getBusinessHomePath,
  getBusinessSlugFromPathname,
} from "@/features/businesses/routes";

type DashboardErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function DashboardError({
  error,
  reset,
}: DashboardErrorProps) {
  useErrorReport("dashboard-error", error);

  const pathname = usePathname();
  const businessSlug = getBusinessSlugFromPathname(pathname);
  const overviewHref = businessSlug
    ? getBusinessHomePath(businessSlug)
    : homePath;

  return (
    <ErrorState
      focusOnMount
      homeHref={overviewHref}
      homeLabel="Go to dashboard"
      layout="inline"
      onRetry={reset}
      referenceId={error.digest}
      variant="error"
    >
      {process.env.NODE_ENV === "development" ? (
        <p className="rounded-lg border border-border/80 bg-muted/35 px-4 py-3 text-left font-mono text-xs leading-6 break-words text-muted-foreground">
          {error.message}
        </p>
      ) : null}
    </ErrorState>
  );
}
