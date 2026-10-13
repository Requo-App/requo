import type { ComponentType, ReactNode } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Shared row chrome for the settings modal pages.
 *
 * Every settings group is the same recipe:
 *   card   bg background/secondary, radius/2xl (16px), pl 12 — the left
 *          padding lives on the card so each row's bottom border stops
 *          12px short of the left edge.
 *   row    py 10 pr 10, min-height 52, 1px border under every row except
 *          the last, label left / control right.
 *   label  Body 1/Regular primary text, optional Body 2/Regular secondary
 *          description underneath.
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const settingsCardVariants = cva("flex w-full flex-col rounded-2xl bg-muted pl-3", {
  variants: {},
});

const settingsRowVariants = cva(
  "flex min-h-[52px] w-full items-center justify-between gap-4 py-2.5 pr-2.5 border-b border-border last:border-b-0",
  {
    variants: {},
  },
);

const settingsValueFieldVariants = cva(
  "flex h-8 w-[202px] shrink-0 items-center gap-0.5 rounded-md bg-muted px-1.5",
  {
    variants: {},
  },
);

/** Grouped card — rows divide themselves with borders that respect pl-12. */
export function SettingsCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        settingsCardVariants(),
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Muted 13px section heading above a card ("Pull Requests", "Notifications"). */
export function SettingsSectionLabel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("w-full px-3 text-muted-foreground", className, "text-body-2-medium")}>{children}</p>
  );
}

/** One label + control row. Rows separate themselves; the last has no border. */
export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={settingsRowVariants()}
    >
      <div className="flex min-w-0 flex-col">
        <p className="text-body-regular text-foreground">{label}</p>
        {description && (
          <p className="text-body-2-regular text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * The grey read-only value field (bg tertiary, h 32, radius/2lg, 202px
 * wide). Not an editable input in the design: it presents the stored value.
 */
export function SettingsValueField({
  icon: Icon,
  children,
  muted = false,
  className,
}: {
  icon?: IconComponent;
  children: ReactNode;
  /** Secondary text color (e.g. the truncated Device ID). */
  muted?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        settingsValueFieldVariants(),
        className,
      )}
    >
      {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
      <span
        className={cn("truncate pl-1", muted ? "text-muted-foreground" : "text-foreground", "text-body-regular")}
      >
        {children}
      </span>
    </div>
  );
}
