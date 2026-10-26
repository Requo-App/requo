import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Sentence-case label above a marketing headline or list.
 *
 * The label uses the body font at 14/20, weight 500, with no tracking or
 * ornament. It renders a span so it can live inside an existing paragraph or
 * a flex row without changing document semantics.
 */
export function MarketingEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn("marketing-eyebrow", className)}>{children}</span>;
}
