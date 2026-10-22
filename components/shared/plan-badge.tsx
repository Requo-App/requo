import type { PlanTier } from "@/lib/plans/plans";
import { planMeta } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

const planBadgeStyles: Record<PlanTier, string> = {
  free: "border-border/80 bg-muted/60 text-muted-foreground shadow-[var(--control-shadow)] dark:bg-muted/40",
  pro: "border-primary/30 bg-primary/10 text-primary shadow-[var(--control-shadow)] dark:border-primary/25 dark:bg-primary/15",
  business:
    "border-violet-300/50 bg-violet-500/10 text-violet-700 shadow-[var(--control-shadow)] dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400",
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
