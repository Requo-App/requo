"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/shared/notify";

/**
 * Analytics export menu.
 *
 * Fetches the CSV from the export route with the same inclusive date bounds
 * the page is showing, then hands the blob to the browser. Daily-metric
 * exports are a Business-tier extra; the item only renders when the server
 * already confirmed the plan.
 */
export function AnalyticsExportMenu({
  businessSlug,
  canExportDaily,
  since,
  until,
}: {
  businessSlug: string;
  /** Business tier: daily metrics CSV in addition to the summary. */
  canExportDaily: boolean;
  /** Inclusive ISO dates matching the visible window. */
  since: string;
  until: string;
}) {
  const [isExporting, setIsExporting] = useState(false);

  const download = async (format: "summary" | "daily") => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/business/${businessSlug}/analytics/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "csv", scope: format, since, until }),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `analytics-${businessSlug}-${since}-to-${until}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Could not export analytics. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
          ) : (
            <Download data-icon="inline-start" aria-hidden />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Export CSV</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void download("summary")}>
          <FileSpreadsheet className="size-4" aria-hidden />
          Summary metrics
        </DropdownMenuItem>
        {canExportDaily ? (
          <DropdownMenuItem onSelect={() => void download("daily")}>
            <FileSpreadsheet className="size-4" aria-hidden />
            Daily metrics
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
