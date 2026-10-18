import {
  BellOff,
  Clock3,
  FileSpreadsheet,
  Inbox,
  Mail,
} from "lucide-react";

import { cn } from "@/lib/utils";

function GraphicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative isolate h-56 overflow-hidden border-b border-border/60 bg-muted/40"
    >
      <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] [background-size:16px_16px] opacity-50 sm:block" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-[var(--surface-elevated-bg)]/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[var(--surface-elevated-bg)] to-transparent" />
      <div className="relative flex h-full items-center justify-center px-5 py-5">
        {children}
      </div>
    </div>
  );
}

function MiniCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Scene({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full transition-transform duration-[var(--motion-duration-base)] ease-[var(--motion-ease-standard)] group-hover:-translate-y-0.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Punchline({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "primary" | "muted";
}) {
  return (
    <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[0.62rem] font-semibold",
          tone === "primary"
            ? "border-primary/25 text-primary"
            : "border-border/80 text-muted-foreground",
        )}
      >
        {children}
      </span>
    </div>
  );
}

// Card 1: "They asked for a quote. You replied two days late."
export function ChecklistGraphic() {
  return (
    <GraphicFrame>
      <Scene className="max-w-[17.5rem] pb-4">
        <MiniCard className="pb-4">
          <div className="flex items-start gap-2.5 px-3 pt-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[0.68rem] font-semibold text-primary">
              SJ
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[0.72rem] font-semibold text-foreground">
                  Sarah Jenkins
                </p>
                <span className="inline-flex shrink-0 items-center gap-1 text-[0.58rem] text-muted-foreground">
                  <Clock3 className="size-2.5" />
                  Mon 9:14am
                </span>
              </div>
              <p className="mt-0.5 truncate text-[0.62rem] text-muted-foreground">
                Kitchen remodel
              </p>
            </div>
          </div>

          <p className="px-3 pb-2.5 pt-2.5 text-[0.68rem] leading-relaxed text-foreground/85">
            Can you send a quote this week?
          </p>

          <div className="mx-3 mb-1 rounded-lg border border-dashed border-border/80 bg-muted/25 px-2.5 py-2">
            <p className="text-[0.62rem] text-muted-foreground/75">No reply sent</p>
          </div>
        </MiniCard>

        <Punchline tone="primary">
          <Clock3 className="size-3" />
          2 days late
        </Punchline>
      </Scene>
    </GraphicFrame>
  );
}

// Card 2: "You forgot to follow up. The lead went cold."
export function WorkflowGraphic() {
  return (
    <GraphicFrame>
      <Scene className="max-w-[17.5rem] pb-5">
        <MiniCard className="pb-5">
          <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[0.72rem] font-semibold text-foreground">
                Kitchen remodel
              </p>
              <p className="mt-0.5 font-mono text-[0.58rem] text-muted-foreground">
                Q-1042 · Sarah Jenkins
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center rounded-full bg-muted/80 px-2 py-0.5 text-[0.58rem] font-medium text-muted-foreground">
              Viewed 6d ago
            </span>
          </div>

          <div className="relative flex flex-col gap-2 px-3 py-2.5">
            <span className="absolute top-3.5 bottom-8 left-4 w-px -translate-x-1/2 bg-border/70" />
            <FollowUpStep done label="Quote sent" meta="Mon" />
            <FollowUpStep done label="Opened" meta="Tue" />
            <FollowUpStep label="Follow-up" meta="Missed" />
          </div>
        </MiniCard>

        <Punchline>
          <BellOff className="size-3" />
          Lead went cold
        </Punchline>
      </Scene>
    </GraphicFrame>
  );
}

function FollowUpStep({
  done = false,
  label,
  meta,
}: {
  done?: boolean;
  label: string;
  meta: string;
}) {
  return (
    <div className={cn("relative z-10 flex items-center gap-2", !done && "opacity-50")}>
      <span
        className={cn(
          "size-2 shrink-0 rounded-full border",
          done
            ? "border-primary bg-primary"
            : "border-dashed border-muted-foreground/70 bg-card",
        )}
      />
      <span
        className={cn(
          "flex-1 text-[0.65rem] font-medium",
          done ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span className="text-[0.58rem] text-muted-foreground">{meta}</span>
    </div>
  );
}

// Card 3: "Inquiries in email. Quotes in a spreadsheet."
export function IntegrationsGraphic() {
  return (
    <GraphicFrame>
      <Scene className="max-w-[17.5rem] pb-4">
        <MiniCard className="pb-4">
          <div className="grid grid-cols-2 divide-x divide-border/60">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
                <Mail className="size-3 text-primary" />
                <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Inbox
                </p>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                <ToolRow active initial="SJ" name="Sarah" status="New" />
                <ToolRow initial="MF" name="Maya" status="Unread" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
                <FileSpreadsheet className="size-3 text-muted-foreground" />
                <p className="text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Quotes
                </p>
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                <ToolRow initial="LP" name="Leo" status="Sent" />
                <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border/80 px-1.5 py-1">
                  <Inbox className="size-3 shrink-0 text-muted-foreground/50" />
                  <span className="truncate text-[0.58rem] text-muted-foreground/70">
                    Sarah missing
                  </span>
                </div>
              </div>
            </div>
          </div>
        </MiniCard>

        <Punchline>
          <span className="flex size-3.5 items-center justify-center text-[0.7rem] leading-none">
            ×
          </span>
          Not connected
        </Punchline>
      </Scene>
    </GraphicFrame>
  );
}

function ToolRow({
  active = false,
  initial,
  name,
  status,
}: {
  active?: boolean;
  initial: string;
  name: string;
  status: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded text-[0.5rem] font-semibold",
          active
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {initial}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[0.62rem] font-medium",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {name}
      </span>
      <span
        className={cn(
          "shrink-0 text-[0.52rem] font-medium",
          active ? "text-primary" : "text-muted-foreground/70",
        )}
      >
        {status}
      </span>
    </div>
  );
}
