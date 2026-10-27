import type { PlanTier } from "@/lib/plans/plans";
import { planMeta } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

const planBadgeStyles: Record<PlanTier, string> = {
  free: "border-border/80 bg-muted/60 text-muted-foreground shadow-[var(--control-shadow)] dark:bg-muted/40",
  pro: "border-primary/30 bg-primary/10 text-primary-ink shadow-[var(--control-shadow)] dark:border-primary/25 dark:bg-primary/15",
  business:
    "border-[color:var(--status-highlight-border)] bg-[var(--status-highlight-bg)] text-[color:var(--status-highlight-fg)] shadow-[var(--control-shadow)]",
};

export function PlanBadge({
  plan,
  className,
}: {
  plan: PlanTier;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold",
        planBadgeStyles[plan],
        className,
      )}
    >
      {planMeta[plan].label}
    </span>
  );
}
