import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  getBusinessAnalyticsPath,
  getBusinessInquiriesPath,
  getBusinessQuotesPath,
} from "@/features/businesses/routes";

export function EmptyQueueState({ businessSlug }: { businessSlug: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/60 py-12">
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          You&apos;re all caught up
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          No urgent items. Here&apos;s what you can do next:
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={getBusinessInquiriesPath(businessSlug)}>
            View inquiries
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={getBusinessQuotesPath(businessSlug)}>
            View quotes
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={getBusinessAnalyticsPath(businessSlug)}>
            Analytics
          </Link>
        </Button>
      </div>
    </div>
  );
}
