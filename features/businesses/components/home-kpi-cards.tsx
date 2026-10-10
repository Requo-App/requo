"use client";

import { Clock, Send, Target, TrendingUp } from "lucide-react";

import {
  StatCards,
  type Stat,
  type StatTone,
} from "@/components/shared/stat-cards";

/**
 * Home KPI row on the dashboard, rendered with the BoardUI StatCards block.
 *
 * StatCards is a client component and its `Stat.icon` prop is a component
 * reference, which cannot cross the server → client boundary. This bridge
 * accepts serializable icon keys from the async server page and resolves
 * them to the Remix icon components here.
 */
export type HomeKpiIcon = "won" | "in-play" | "acceptance" | "response-time";

export type HomeKpiStat = {
  icon: HomeKpiIcon;
  label: string;
  value: string;
  /** Omit for stock metrics where the caption already tells the story. */
  delta?: string;
  deltaColor?: Stat["deltaColor"];
  /** Which way the metric moved; drives the pill's arrow glyph. Defaults to
   *  the sign of `delta` when omitted. */
  deltaDirection?: "up" | "down" | "flat";
  tone?: StatTone;
  caption?: string;
  hint?: string;
};

const ICONS: Record<HomeKpiIcon, Stat["icon"]> = {
  won: TrendingUp,
  "in-play": Send,
  acceptance: Target,
  "response-time": Clock,
};

export function HomeKpiCards({ stats }: { stats: HomeKpiStat[] }) {
  const resolved: Stat[] = stats.map((stat) => ({
    ...stat,
    icon: ICONS[stat.icon],
  }));

  return <StatCards variant="footer" stats={resolved} columns={4} />;
}