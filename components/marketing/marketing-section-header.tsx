import type { ReactNode } from "react";

import { MarketingEyebrow } from "@/components/marketing/marketing-eyebrow";
import { cn } from "@/lib/utils";

/**
 * Shared header for landing sections: a sentence-case label and headline in
 * the first two columns, with a short intro in the third. The label sits 12px
 * above the headline. On desktop the intro's last baseline sits on the
 * headline's last baseline instead of floating in its own block. Keep the
 * headline near two thirds of the content width and let the third column
 * carry the only supporting paragraph.
 */
export function MarketingSectionHeader({
  className,
  eyebrow,
  intro,
  title,
}: {
  className?: string;
  eyebrow: string;
  intro: ReactNode;
  title: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-6 lg:grid-cols-3 lg:items-baseline-last lg:gap-x-5",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:col-span-2">
        <MarketingEyebrow>{eyebrow}</MarketingEyebrow>
        <h2 className="max-w-[15em] font-heading text-marketing-section-title text-balance text-foreground">
          {title}
        </h2>
      </div>
      <p className="max-w-[36ch] text-pretty text-marketing-intro text-muted-foreground">
        {intro}
      </p>
    </div>
  );
}
