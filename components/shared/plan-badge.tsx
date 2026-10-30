import type { PlanTier } from "@/lib/plans/plans";
import { planMeta } from "@/lib/plans/plans";
import { Badge } from "@/components/ui/badge";
import { statusToneClassNames } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

/**
 * Plan tiers borrow the neutral and highlight status tones, so a tone change
 * reaches the plan pills instead of drifting into a second colour map. Pro is
 * the one plan-specific tone; it has no status equivalent.
 */
const planBadgeStyles: Record<PlanTier, string> = {
  free: statusToneClassNames.neutral,
  pro: "border-primary/30 bg-primary/15 text-primary-ink",
  business: statusToneClassNames.highlight,
};

/**
 * Plan pill for the current business.
 *
 * Composes the same colourless `Badge` shell as `StatusBadge` so plan tiers
 * share the status pills' geometry in both themes. The tier—not the colour—is
 * always spelled out in the label.
 */
export function PlanBadge({
  plan,
  size = "default",
  className,
}: {
  plan: PlanTier;
  /** `sm` matches the compact status pill used in dense rows (h-5). */
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <Badge
      data-plan={plan}
      variant="status"
      className={cn(
        "shrink-0 rounded-full",
        size === "sm" ? "h-5 px-2" : null,
        planBadgeStyles[plan],
        className,
      )}
    >
      {planMeta[plan].label}
    </Badge>
  );
}
