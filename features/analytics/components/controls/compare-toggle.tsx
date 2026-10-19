"use client";

import { Switch } from "@/components/shared/switch";

import { useAnalyticsParams } from "./use-analytics-params";

/**
 * "Compare to previous period" switch. Comparison is on by default for paid
 * plans; turning it off writes `compare=0` so the state survives refresh and
 * sharing. All-time has no comparable prior window, so the control hides.
 */
export function CompareToggle({ compare }: { compare: boolean }) {
  const { update } = useAnalyticsParams();

  return (
    <Switch
      size="sm"
      isSelected={compare}
      onChange={(isSelected) => update({ compare: isSelected ? null : "0" })}
      className="shrink-0"
    >
      Compare
    </Switch>
  );
}
