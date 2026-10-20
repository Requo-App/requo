"use client";

import { useState, type ReactNode } from "react";

import { Tab, TabList, TabPanel, Tabs } from "@/components/shared/tabs";
import { cn } from "@/lib/utils";

import { AnalyticsCard } from "./analytics-card";
import { PlotFrame, TableFrame } from "./plot-frame";

export type AnalyticsTabItem = {
  id: string;
  label: string;
  /** The plot for this tab. */
  chart: ReactNode;
  /** The same numbers as a table. */
  table?: ReactNode;
};

/**
 * A card that switches between related plots.
 *
 * The tab strip sits under the title; the Chart | Table toggle lives in the
 * header like every other chart card, so the card anatomy is identical
 * whether or not a card has tabs.
 */
export function AnalyticsTabbedCard({
  title,
  description,
  info,
  tabs,
  footer,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  info?: string;
  tabs: AnalyticsTabItem[];
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const [selected, setSelected] = useState(tabs[0]?.id ?? "");
  const [view, setView] = useState<"chart" | "table">("chart");

  const hasTable = tabs.some((tab) => Boolean(tab.table));

  return (
    <AnalyticsCard
      title={title}
      description={description}
      info={info}
      footer={footer}
      className={className}
      bodyClassName={cn("gap-3", bodyClassName)}
      action={
        hasTable ? (
          <div
            role="group"
            aria-label="View as"
            className="flex items-center gap-0.5 rounded-full border border-border/60 p-0.5"
          >
            <ViewButton active={view === "chart"} onClick={() => setView("chart")}>
              Chart
            </ViewButton>
            <ViewButton active={view === "table"} onClick={() => setView("table")}>
              Table
            </ViewButton>
          </div>
        ) : null
      }
    >
      <Tabs
        className="min-h-0 flex-1 gap-3"
        selectedKey={selected}
        onSelectionChange={(key) => setSelected(String(key))}
      >
        <TabList
          aria-label={`${typeof title === "string" ? title : "Chart"} views`}
          className="w-auto gap-4 border-b-0"
        >
          {tabs.map((tab) => (
            <Tab key={tab.id} id={tab.id} className="px-0 py-1">
              {tab.label}
            </Tab>
          ))}
        </TabList>

        {tabs.map((tab) => (
          <TabPanel
            key={tab.id}
            id={tab.id}
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            {view === "table" && tab.table ? (
              <TableFrame>{tab.table}</TableFrame>
            ) : (
              <PlotFrame>{tab.chart}</PlotFrame>
            )}
          </TabPanel>
        ))}
      </Tabs>
    </AnalyticsCard>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
