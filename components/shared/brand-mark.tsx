import Link from "next/link";

import { BrandWordmark } from "@/components/shared/brand-wordmark";
import { brandGlyphPaths } from "@/lib/brand/glyph";
import { cn } from "@/lib/utils";

type BrandMarkSize = "default" | "lg" | "xl";

type BrandMarkProps = {
  className?: string;
  collapseLabel?: boolean;
  subtitle?: string | null;
  href?: string;
  size?: BrandMarkSize;
};

const logoSizeClass: Record<BrandMarkSize, string> = {
  default: "size-7.5",
  lg: "size-9.5",
  xl: "size-14",
};

const wordmarkSizeClass: Record<BrandMarkSize, string> = {
  default: "text-[1.26rem] tracking-[-0.02em]",
  lg: "text-[1.52rem] tracking-[-0.02em] sm:text-[1.65rem]",
  xl: "text-[1.95rem] tracking-[-0.02em] sm:text-[2.25rem]",
};

const wordmarkNoSubtitleSizeClass: Record<BrandMarkSize, string> = {
  default: "text-[1.32rem] tracking-[-0.025em]",
  lg: "text-[1.62rem] tracking-[-0.025em] sm:text-[1.78rem]",
  xl: "text-[2.15rem] tracking-[-0.025em] sm:text-[2.45rem]",
};

export function BrandMark({
  className,
  collapseLabel = false,
  subtitle = "Service workflow",
  href = "/",
  size = "default",
}: BrandMarkProps) {
  return (
    <Link
      href={href}
      aria-label="Requo"
      className={cn(
        "inline-flex items-center gap-2 text-foreground",
        collapseLabel && "group-data-[collapsible=icon]:gap-0",
        className,
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center text-primary",
          logoSizeClass[size],
        )}
      >
        <BrandLogoIcon className="size-full" />
      </span>
      <span
        className={cn(
          "flex min-w-0 flex-col leading-none",
          collapseLabel && "group-data-[collapsible=icon]:hidden",
        )}
      >
        <BrandWordmark className={cn("truncate", subtitle !== null ? wordmarkSizeClass[size] : wordmarkNoSubtitleSizeClass[size])} />
        {subtitle !== null ? (
          <span className="mt-0.5 truncate text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {subtitle}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function BrandLogoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {brandGlyphPaths.map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
