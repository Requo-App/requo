"use client";

import { useState } from "react";
import { Lock, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FeatureGate } from "@/features/paywall/components/feature-gate";
import type { UpgradeActionProps } from "@/features/paywall/types";
import type { BusinessPlan } from "@/lib/plans";
import type { AnalyticsRangePreset } from "@/features/analytics/lib/window";

import { AnalyticsExportMenu } from "./analytics-export-menu";
import { AnalyticsReportsSheet } from "./analytics-reports-sheet";
import {
  AnalyticsRangePicker,
  AnalyticsRangePill,
} from "./analytics-range-picker";
import { CompareToggle } from "./compare-toggle";

/**
 * Analytics toolbar: range, comparison, and export.
 *
 * Desktop renders the controls inline; phones get one summary button opening
 * a sheet with the same controls (the list-filter pattern). Free workspaces
 * see a static "Last 30 days" pill — the window itself is server-clamped, the
 * pill only states it. Export is server-gated to Pro+; the locked trigger
 * opens the upgrade popover instead of firing a request.
 */
export function AnalyticsToolbar({
  plan,
  range,
  from,
  to,
  compare,
  label,
  canCompare,
  canExport,
  canExportDaily,
  canManageReports,
  reportRecipientLimit,
  businessSlug,
  exportSince,
  exportUntil,
  upgradeAction,
}: {
  plan: BusinessPlan;
  range: AnalyticsRangePreset;
  from: string | null;
  to: string | null;
  compare: boolean;
  label: string;
  canCompare: boolean;
  canExport: boolean;
  canExportDaily: boolean;
  canManageReports: boolean;
  reportRecipientLimit: number;
  businessSlug: string;
  exportSince: string;
  exportUntil: string;
  upgradeAction: UpgradeActionProps;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const exportControl = canExport ? (
    <AnalyticsExportMenu
      businessSlug={businessSlug}
      canExportDaily={canExportDaily}
      since={exportSince}
      until={exportUntil}
    />
  ) : (
    <FeatureGate
      feature="analyticsPerformance"
      plan={plan}
      variant="action"
      upgradeAction={upgradeAction}
      description="Export analytics as CSV and share period-over-period reports."
    >
      <Button variant="outline" size="sm" disabled>
        <Lock data-icon="inline-start" aria-hidden />
        Export
      </Button>
    </FeatureGate>
  );

  const reportControl = (compact: boolean) =>
    canManageReports ? (
      <AnalyticsReportsSheet
        businessSlug={businessSlug}
        recipientLimit={reportRecipientLimit}
        compact={compact}
      />
    ) : (
      <FeatureGate
        feature="analyticsPerformance"
        plan={plan}
        variant="action"
        upgradeAction={upgradeAction}
        description="Set goals, add tracking notes, and schedule recurring reports."
      >
        <Button
          variant="outline"
          size={compact ? "icon-sm" : "sm"}
          aria-label={compact ? "Analytics reports" : undefined}
          disabled
        >
          <Lock
            className={compact ? "size-4" : undefined}
            data-icon={compact ? undefined : "inline-start"}
            aria-hidden
          />
          {compact ? null : "Reports"}
        </Button>
      </FeatureGate>
    );

  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {canCompare ? (
          <AnalyticsRangePicker label={label} range={range} from={from} to={to} />
        ) : (
          <AnalyticsRangePill label={label} />
        )}
        {canCompare ? <CompareToggle compare={compare} /> : null}
        {reportControl(false)}
        {exportControl}
      </div>

      <div className="flex w-full items-center gap-2 sm:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="flex-1 justify-between">
              <span className="flex min-w-0 items-center gap-1.5">
                <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-sm">
            <SheetHeader>
              <SheetTitle>Analytics controls</SheetTitle>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p className="meta-label">Date range</p>
                {canCompare ? (
                  <AnalyticsRangePicker label={label} range={range} from={from} to={to} />
                ) : (
                  <AnalyticsRangePill label={label} />
                )}
              </div>
              {canCompare ? (
                <div className="flex flex-col gap-2">
                  <p className="meta-label">Comparison</p>
                  <CompareToggle compare={compare} />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <p className="meta-label">Export</p>
                {exportControl}
              </div>
            </SheetBody>
          </SheetContent>
        </Sheet>
        {reportControl(true)}
      </div>
    </>
  );
}
