"use client";

import { useEffect } from "react";
import { toast } from "@/components/shared/notify";

import {
  checkMilestone,
  type MilestoneKey,
} from "@/features/onboarding/milestones";

type MilestoneCelebratorProps = {
  /** Milestones that are now achieved (server-resolved). */
  achieved: MilestoneKey[];
};

/**
 * Checks achieved milestones against localStorage and fires a celebration
 * toast for any that haven't been shown yet. Renders nothing.
 */
export function MilestoneCelebrator({ achieved }: MilestoneCelebratorProps) {
  useEffect(() => {
    // Small delay so the page settles before showing toasts
    const timer = setTimeout(() => {
      for (const key of achieved) {
        const milestone = checkMilestone(key);
        if (milestone) {
          toast.success(milestone.title, {
            description: milestone.description,
            duration: 6000,
          });
          // Only celebrate one milestone per page load to avoid toast spam
          break;
        }
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [achieved]);

  return null;
}
