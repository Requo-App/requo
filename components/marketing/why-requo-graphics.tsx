import {
  BellOff,
  CircleDot,
  Clock3,
  FileSpreadsheet,
  Mail,
  Send,
  Unlink2,
} from "lucide-react";

import {
  MockAvatar,
  MockBadge,
  MockCard,
  MockFooterStrip,
  MockSectionLabel,
  mockMonoClassName,
  mockSecondaryClassName,
  mockTitleClassName,
} from "@/components/marketing/marketing-mock-primitives";
import { cn } from "@/lib/utils";

function GraphicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="flex w-full items-center justify-center"
      inert
    >
      {children}
    </div>
  );
}

const problemCardClassName = "h-[15.5rem]";

// Card 1: "They asked for a quote. You replied two days late."
export function ChecklistGraphic() {
  return (
    <GraphicFrame>
      <MockCard className={problemCardClassName}>
        <div className="flex shrink-0 items-start gap-2.5 border-b border-border/60 px-4 py-3">
          <MockAvatar initials="SJ" size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className={cn(mockTitleClassName, "min-w-0")}>
                Sarah Jenkins
              </p>
              <MockBadge icon={CircleDot} label="New" tone="info" />
            </div>
            <p className={cn(mockSecondaryClassName, "mt-0.5")}>
              Kitchen remodel
            </p>
          </div>
        </div>

        <div className="px-4 py-3">
          <p className="text-sm leading-5 text-foreground">
            Can you send a quote this week?
          </p>
          <p className={cn(mockMonoClassName, "mt-1.5")}>Mon 9:41 AM</p>
        </div>

        <div className="mt-auto px-4 pb-4">
          <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs leading-4 text-muted-foreground">
            No reply sent
          </div>
        </div>

        <MockFooterStrip icon={Clock3}>2 days late</MockFooterStrip>
      </MockCard>
    </GraphicFrame>
  );
}

// Card 2: "You forgot to follow up. The lead went cold."
export function WorkflowGraphic() {
  return (
    <GraphicFrame>
      <MockCard className={problemCardClassName}>
        <div className="flex shrink-0 items-start gap-2.5 border-b border-border/60 px-4 py-3">
          <MockAvatar initials="SJ" size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className={cn(mockTitleClassName, "min-w-0")}>
                Kitchen remodel
              </p>
              <MockBadge icon={Send} label="Sent" tone="highlight" />
            </div>
            <p className={cn(mockSecondaryClassName, "mt-0.5")}>
              Sarah Jenkins
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center px-4 py-3">
          <TimelineStep
            connector="solid"
            label="Quote sent"
            meta="Mon 9:48 AM"
          />
          <TimelineStep
            connector="warning"
            label="Opened"
            meta="Tue 2:18 PM"
          />
          <TimelineStep label="Follow-up" meta="Missed" warning />
        </div>

        <MockFooterStrip icon={BellOff}>Lead went cold</MockFooterStrip>
      </MockCard>
    </GraphicFrame>
  );
}

function TimelineStep({
  connector,
  label,
  meta,
  warning = false,
}: {
  connector?: "solid" | "warning";
  label: string;
  meta?: string;
  warning?: boolean;
}) {
  return (
    <div className="relative flex gap-3 pb-3">
      {connector ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-3 bottom-0 left-[3px] w-px",
            connector === "warning"
              ? "border-l border-dashed border-warning/60"
              : "bg-border",
          )}
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 mt-1 size-2 shrink-0 rounded-full border",
          warning ? "border-warning bg-card" : "border-border bg-card",
        )}
      />
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span
          className={cn(
            "truncate text-xs leading-4 font-medium",
            warning ? "text-warning-ink" : "text-foreground",
          )}
        >
          {label}
        </span>
        {meta ? (
          <span
            className={cn(
              "shrink-0",
              warning
                ? "text-xs leading-4 font-medium text-warning-ink"
                : mockMonoClassName,
            )}
          >
            {meta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// Card 3: "Inquiries in email. Quotes in a spreadsheet."
export function IntegrationsGraphic() {
  return (
    <GraphicFrame>
      <MockCard className={cn(problemCardClassName, "justify-between")}>
        <div>
          <MockSectionLabel icon={Mail}>Inbox</MockSectionLabel>
          <div className="flex items-center gap-2.5 px-4 py-2.5">
            <MockAvatar initials="SJ" />
            <div className="min-w-0 flex-1">
              <p className={mockTitleClassName}>Sarah Jenkins</p>
              <p className={mockSecondaryClassName}>Kitchen remodel</p>
            </div>
            <MockBadge icon={CircleDot} label="New" tone="info" />
          </div>
        </div>

        <div className="relative flex h-7 shrink-0 items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute inset-x-5 top-1/2 border-t border-dashed border-border"
          />
          <span className="relative flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
            <Unlink2 aria-hidden="true" className="size-3" />
          </span>
        </div>

        <div>
          <MockSectionLabel icon={FileSpreadsheet}>Quotes</MockSectionLabel>
          <div className="flex items-center gap-2.5 px-4 py-2.5">
            <MockAvatar initials="LP" />
            <div className="min-w-0 flex-1">
              <p className={mockTitleClassName}>Leo Park</p>
              <p className={mockSecondaryClassName}>Custom bookshelves</p>
            </div>
            <MockBadge icon={Send} label="Sent" tone="highlight" />
          </div>
        </div>

        <MockFooterStrip icon={Unlink2}>Not connected</MockFooterStrip>
      </MockCard>
    </GraphicFrame>
  );
}
