import type { ComponentProps, ComponentType, ReactNode } from "react";

import { Avatar } from "@/components/shared/avatar";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared primitives for the decorative landing-page product illustrations.
 *
 * These mocks are not product UI: they are one card shell, one row rhythm, and
 * one badge vocabulary repeated across the landing page. Keep them on the same
 * tokens as the real app so light and dark stay in sync.
 */

export const mockTitleClassName =
  "truncate text-sm leading-5 font-semibold tracking-tight text-foreground";
export const mockSecondaryClassName =
  "truncate text-xs leading-4 text-muted-foreground";
export const mockMonoClassName =
  "font-mono text-[0.6875rem] leading-4 tabular-nums text-muted-foreground";

export function MockCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "marketing-mock-card flex w-full flex-col overflow-hidden text-left",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MockCardHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5",
        className,
      )}
    >
      <p className={cn(mockTitleClassName, "min-w-0")}>{title}</p>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}

export function MockList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col divide-y divide-border/60", className)}>
      {children}
    </div>
  );
}

export function MockRow({
  children,
  className,
  highlighted = false,
}: {
  children: ReactNode;
  className?: string;
  /** A neutral row with a 2px accent bar — never a coloured row tint. */
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 items-center gap-3 px-4 py-2.5",
        highlighted && "marketing-mock-row-highlight",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MockAvatar({
  initials,
  size = "sm",
  className,
}: {
  initials: string;
  size?: ComponentProps<typeof Avatar>["size"];
  className?: string;
}) {
  return (
    <Avatar
      aria-hidden="true"
      className={cn(
        "bg-accent font-semibold tracking-normal text-foreground",
        className,
      )}
      color="neutral"
      initials={initials}
      size={size}
    />
  );
}

export type MockBadgeTone =
  | "neutral"
  | "info"
  | "highlight"
  | "warning"
  | "success";

const mockBadgeTones: Record<MockBadgeTone, StatusTone> = {
  neutral: "neutral",
  info: "info",
  highlight: "highlight",
  warning: "warning",
  success: "success",
};

export function MockBadge({
  tone = "neutral",
  label,
  icon: Icon,
  className,
}: {
  tone?: MockBadgeTone;
  label: string;
  icon?: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  className?: string;
}) {
  return (
    <StatusBadge
      className={cn(
        "h-5 px-2 text-xs font-medium",
        tone === "neutral" && "text-foreground",
        className,
      )}
      icon={Icon}
      label={label}
      size="sm"
      tone={mockBadgeTones[tone]}
    />
  );
}

export function MockButton({
  children,
  variant = "default",
  icon: Icon,
  className,
}: {
  children: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost";
  icon?: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
    "data-icon"?: string;
  }>;
  className?: string;
}) {
  return (
    <Button
      className={cn("h-7 px-2.5 text-xs", className)}
      size="xs"
      tabIndex={-1}
      type="button"
      variant={variant}
    >
      {Icon ? (
        <Icon data-icon="inline-start" aria-hidden="true" />
      ) : null}
      {children}
    </Button>
  );
}

export function MockFooterStrip({
  children,
  icon: Icon,
}: {
  children: ReactNode;
  icon: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
}) {
  return (
    <div className="mt-auto flex shrink-0 items-center gap-2 border-t border-warning/25 bg-warning/10 px-4 py-2.5 text-xs leading-4 font-medium text-warning-ink">
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </div>
  );
}

export function MockSectionLabel({
  children,
  icon: Icon,
  className,
}: {
  children: ReactNode;
  icon: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2",
        className,
      )}
    >
      <span className="inline-flex min-w-0 items-center gap-2 text-xs leading-4 font-medium text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{children}</span>
      </span>
    </div>
  );
}

export function MockSourceLabel({
  children,
  icon: Icon,
}: {
  children: ReactNode;
  icon: ComponentType<{
    className?: string;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}
