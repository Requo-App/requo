import { Eye, Link2 } from "lucide-react";
import Image from "next/image";

import { MockCard } from "@/components/marketing/marketing-mock-primitives";
import type {
  SolutionLandingHeroImage,
  SolutionLandingSample,
} from "@/components/marketing/solutions-data";
import { BrandLogoIcon } from "@/components/shared/brand-mark";
import { BrandWordmark } from "@/components/shared/brand-wordmark";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import { cn } from "@/lib/utils";

/**
 * The solution hero: one industry photo in a fixed-height rounded frame with a
 * compact quote card composited in the browser. The card is decorative, so it
 * stays out of the accessibility tree; the photo's alt text carries the scene.
 */
export function SolutionHeroVisual({
  cardSide,
  image,
  sample,
}: {
  cardSide: "left" | "right";
  image: SolutionLandingHeroImage;
  sample: SolutionLandingSample;
}) {
  return (
    <div className="relative h-[24rem] overflow-hidden rounded-xl bg-muted sm:h-[28rem] lg:h-[31rem]">
      <Image
        alt={image.alt}
        className="h-full w-full object-cover"
        height={image.height}
        preload
        quality={95}
        sizes="(min-width: 1280px) 48rem, (min-width: 1024px) 44rem, (min-width: 640px) 95vw, 36rem"
        src={image.src}
        style={{ objectPosition: image.objectPosition }}
        width={image.width}
      />

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute bottom-3 w-[min(16.5rem,calc(100%-1.5rem))] select-none sm:bottom-5 sm:w-[18rem]",
          cardSide === "left" ? "left-3 sm:left-5" : "right-3 sm:right-5",
        )}
        inert
      >
        <MockCard>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3.5 py-2.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <BrandLogoIcon className="size-4 shrink-0 text-primary" />
              <BrandWordmark className="truncate text-[0.95rem] leading-none tracking-[-0.03em]" />
            </span>
            <QuoteStatusBadge size="sm" status="sent" />
          </div>

          <div className="px-3.5 py-3">
            <p className="truncate font-mono text-[0.625rem] leading-3 tabular-nums text-muted-foreground">
              {sample.quoteNumber} · {sample.project}
            </p>
            <p className="mt-1 truncate text-sm leading-5 font-semibold tracking-tight text-foreground">
              {sample.customer}
            </p>
            <p className="mt-2 font-mono text-xl leading-6 font-semibold tabular-nums tracking-tight text-foreground">
              {sample.total}
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-3.5 py-2 text-[0.6875rem] leading-4 text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye aria-hidden="true" className="size-3.5 text-primary-ink" />
              Viewed 3 days ago
            </span>
            <span className="inline-flex items-center gap-1">
              <Link2 aria-hidden="true" className="size-3.5" />
              Secure link
            </span>
          </div>
        </MockCard>
      </div>
    </div>
  );
}
