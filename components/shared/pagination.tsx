"use client";

import { useEffect, useRef, useState } from "react";
import { RiArrowLeftLine, RiArrowRightLine } from "@remixicon/react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Button } from "@/components/shared/button";

// Pagination — matches the dashboard style:
//   - Previous / Next use the secondary small `Button` (same as the Recent
//     hires card pager) with arrow icons.
//   - Page numbers are 32×32 (radius/lg) cells. Active cell borrows the
//     secondary-button surface (card bg + default border + xs shadow);
//     inactive cells are ghost with a secondary-hover background on hover.
//   - Overflow collapses to leading/trailing dots around a sibling window.
//
// Below `COMPACT_WIDTH`, a `ResizeObserver` on the nav switches to a compact
// layout — icon-only Previous/Next and `siblingCount` clamped to 0 — so the
// row never overflows a narrow container instead of clipping mid-label.
//
// Controlled: pass `page`, `totalPages`, and `onChange`.

export interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Page numbers shown on each side of the current page. Default 1. */
  siblingCount?: number;
  className?: string;
}

const DOTS = "dots";

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function paginationRange(
  current: number,
  total: number,
  sibling: number,
): (number | typeof DOTS)[] {
  // first + last + current + 2*sibling + 2 dots
  const totalPageNumbers = sibling * 2 + 5;
  if (totalPageNumbers >= total) return range(1, total);

  const leftSibling = Math.max(current - sibling, 1);
  const rightSibling = Math.min(current + sibling, total);
  const showLeftDots = leftSibling > 2;
  const showRightDots = rightSibling < total - 2;

  if (!showLeftDots && showRightDots) {
    return [...range(1, 3 + 2 * sibling), DOTS, total];
  }
  if (showLeftDots && !showRightDots) {
    return [1, DOTS, ...range(total - (2 + 2 * sibling), total)];
  }
  return [1, DOTS, ...range(leftSibling, rightSibling), DOTS, total];
}

// No transition on the cells: animating background/shadow/color makes the
// previously-active number visibly fade out ("flicker") on every page change.
// Active/inactive are exclusive variants — the source's cx() kept the text
// style next to the text color, while stock tailwind-merge would drop one.
const pageCellVariants = cva(
  "flex size-8 shrink-0 items-center justify-center rounded-lg text-body-medium cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  {
    variants: {
      active: {
        true: "control-surface-secondary border text-foreground",
        false: "text-muted-foreground hover:bg-accent hover:text-foreground",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

// Dots cell: single string (not cn-merged) so the text style survives next to
// the text color.
const pageDotsClass = "flex size-8 shrink-0 items-center justify-center rounded-lg text-body-medium text-muted-foreground";

/** Below this nav width, Previous/Next drop their labels and siblingCount
 *  clamps to 0 — the full-label, full-sibling layout starts clipping
 *  somewhere around 380–420px depending on totalPages' digit count. */
const COMPACT_WIDTH = 420;

function useIsCompact() {
  const ref = useRef<HTMLElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsCompact(entry.contentRect.width < COMPACT_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, isCompact] as const;
}

export function Pagination({
  page,
  totalPages,
  onChange,
  siblingCount = 1,
  className,
}: PaginationProps) {
  const [navRef, isCompact] = useIsCompact();
  if (totalPages <= 1) return null;
  const pages = paginationRange(page, totalPages, isCompact ? 0 : siblingCount);

  return (
    <nav
      ref={navRef}
      aria-label="Pagination"
      className={["flex w-full items-center justify-between gap-2", cn(className)]
        .filter(Boolean)
        .join(" ")}
    >
      <Button
        variant="secondary"
        size="small"
        iconOnly={isCompact}
        leadingIcon={RiArrowLeftLine}
        aria-label={isCompact ? "Previous page" : undefined}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {isCompact ? undefined : "Previous"}
      </Button>

      <ul className="flex min-w-0 items-center gap-0.5">
        {pages.map((item, i) =>
          item === DOTS ? (
            <li
              key={`dots-${i}`}
              aria-hidden
              className={pageDotsClass}
            >
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                aria-label={`Go to page ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onChange(item)}
                className={pageCellVariants({ active: item === page })}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ul>

      <Button
        variant="secondary"
        size="small"
        iconOnly={isCompact}
        leadingIcon={isCompact ? RiArrowRightLine : undefined}
        trailingIcon={isCompact ? undefined : RiArrowRightLine}
        aria-label={isCompact ? "Next page" : undefined}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        {isCompact ? undefined : "Next"}
      </Button>
    </nav>
  );
}
