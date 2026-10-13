"use client";

import {
  RiCoinsFill,
  RiErrorWarningLine,
  RiFileTextLine,
  RiSparklingLine,
} from "@remixicon/react";

import {
  StatCards,
  type Stat,
} from "@/components/shared/stat-cards";
import type { AdminAiStat } from "@/features/admin/components/ai/admin-ai-overview";

const ICONS: Record<AdminAiStat["icon"], Stat["icon"]> = {
  calls: RiSparklingLine,
  tokens: RiFileTextLine,
  cost: RiCoinsFill,
  errors: RiErrorWarningLine,
};

/**
 * Client bridge for the AI overview KPI tiles.
 *
 * Accepts serializable icon keys from the server and resolves them to
 * icon components here, because component references cannot cross the
 * server → client boundary (same bridge as `HomeKpiCards`).
 */
export function AdminAiStatCards({ stats }: { stats: AdminAiStat[] }) {
  const resolved: Stat[] = stats.map((stat) => ({
    ...stat,
    icon: ICONS[stat.icon],
  }));

  return <StatCards stats={resolved} variant="plain" />;
}
