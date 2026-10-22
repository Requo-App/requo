import { BarChart3 } from "lucide-react";
import Link from "next/link";

import { DashboardEmptyState } from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import {
  getBusinessNewQuotePath,
  getBusinessServicesPath,
} from "@/features/businesses/routes";

/**
 * First-run analytics: the business has never recorded an inquiry or quote.
 * Points at the two actions that create data instead of showing empty charts.
 */
export function AnalyticsFirstRunEmpty({ businessSlug }: { businessSlug: string }) {
  return (
    <DashboardEmptyState
      variant="section"
      icon={BarChart3}
      title="No data yet"
      description="Share your service page to start collecting inquiries, or send your first quote. Metrics appear here as soon as there is activity."
      action={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href={getBusinessServicesPath(businessSlug)}>Set up your service page</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={getBusinessNewQuotePath(businessSlug)}>Send your first quote</Link>
          </Button>
        </div>
      }
      className="mx-auto w-full max-w-2xl"
    />
  );
}

/** No activity in the selected window; suggests widening it. */
export function AnalyticsRangeEmpty() {
  return (
    <DashboardEmptyState
      variant="section"
      icon={BarChart3}
      title="No activity in this range"
      description="Nothing happened during the selected dates. Try a wider range — Last 90 days or Last 12 months usually covers quieter periods."
    />
  );
}
