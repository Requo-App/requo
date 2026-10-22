import { FeatureGate } from "@/features/entitlements/components/feature-gate";
import type { UpgradeActionProps } from "@/features/entitlements/types";
import type { PlanFeature } from "@/lib/plans/entitlements";
import type { PlanTier } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";

/**
 * Static previews for locked tabs. These are sample numbers written into the
 * component — never a query result — so a Free business never receives
 * premium data in the DOM, only the shape of what unlocking buys.
 */

function DemoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/60 bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
    </div>
  );
}

function DemoBars({
  rows,
}: {
  rows: Array<{ label: string; value: string; width: number; tone?: string }>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4">
      {rows.map((row) => (
        <div className="flex flex-col gap-1.5" key={row.label}>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium tabular-nums text-foreground">{row.value}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", row.tone ?? "bg-chart-1")}
              style={{ width: `${row.width}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PerformanceTabPreview() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <DemoStat label="Visitors" value="1,240" />
        <DemoStat label="Form conversion" value="18.4%" />
        <DemoStat label="Win rate" value="42.1%" />
        <DemoStat label="Revenue won" value="$24,300" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DemoBars
          rows={[
            { label: "Direct", value: "41%", width: 82 },
            { label: "google.com", value: "33%", width: 66 },
            { label: "facebook.com", value: "18%", width: 36, tone: "bg-chart-2" },
            { label: "referrals", value: "8%", width: 16, tone: "bg-chart-3" },
          ]}
        />
        <DemoBars
          rows={[
            { label: "Response time", value: "3.2h", width: 32 },
            { label: "Time to quote", value: "11.4h", width: 54, tone: "bg-chart-2" },
            { label: "Draft → sent", value: "78%", width: 78, tone: "bg-chart-3" },
            { label: "Avg discount", value: "4.1%", width: 18, tone: "bg-chart-4" },
          ]}
        />
      </div>
    </div>
  );
}

export function OperationsTabPreview() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <DemoStat label="Follow-ups completed" value="86" />
        <DemoStat label="On-time rate" value="92%" />
        <DemoStat label="AI-drafted win rate" value="38%" />
        <DemoStat label="Agent capture rate" value="64%" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DemoBars
          rows={[
            { label: "Response rate · with follow-up", value: "64%", width: 64 },
            { label: "Response rate · without", value: "41%", width: 41, tone: "bg-chart-3" },
            { label: "Acceptance · with follow-up", value: "38%", width: 38, tone: "bg-chart-2" },
            { label: "Acceptance · without", value: "22%", width: 22, tone: "bg-chart-4" },
          ]}
        />
        <DemoBars
          rows={[
            { label: "Knowledge sources", value: "12 / 25", width: 48 },
            { label: "Agent sessions → inquiries", value: "37", width: 64, tone: "bg-chart-2" },
            { label: "Readiness blocks", value: "5", width: 20, tone: "bg-chart-3" },
            { label: "Email delivered", value: "99.2%", width: 99, tone: "bg-chart-4" },
          ]}
        />
      </div>
    </div>
  );
}

export function TeamTabPreview() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <DemoStat label="Members" value="5" />
        <DemoStat label="Median response" value="2.1h" />
        <DemoStat label="SLA breaches" value="4" />
        <DemoStat label="Value won" value="$61,200" />
      </div>
      <DemoBars
        rows={[
          { label: "Ana · 24 quotes · 46% win rate", value: "$28,400", width: 46 },
          { label: "Miguel · 18 quotes · 39% win rate", value: "$18,900", width: 31, tone: "bg-chart-2" },
          { label: "Priya · 12 quotes · 33% win rate", value: "$9,300", width: 15, tone: "bg-chart-3" },
          { label: "Unassigned queue", value: "6", width: 9, tone: "bg-chart-4" },
        ]}
      />
    </div>
  );
}

export function AnalyticsTabLock({
  feature,
  plan,
  upgradeAction,
  description,
  preview,
}: {
  feature: PlanFeature;
  plan: PlanTier;
  upgradeAction: UpgradeActionProps;
  description: string;
  preview: React.ReactNode;
}) {
  return (
    <FeatureGate
      feature={feature}
      plan={plan}
      variant="page"
      upgradeAction={upgradeAction}
      description={description}
      previewContent={preview}
    >
      {null}
    </FeatureGate>
  );
}
