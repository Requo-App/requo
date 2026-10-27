import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import { cn } from "@/lib/utils";

function getPlainTextNode(value: ReactNode) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const textParts = value.map((item) =>
      typeof item === "string" || typeof item === "number" ? String(item) : null,
    );

    if (textParts.every((item) => item !== null)) {
      return textParts.join("");
    }
  }

  return null;
}

type InfoTileProps = {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  className?: string;
  valueClassName?: string;
};

export function InfoTile({
  label,
  value,
  description,
  icon: Icon,
  className,
  valueClassName,
}: InfoTileProps) {
  const plainLabel = getPlainTextNode(label);
  const plainValue = getPlainTextNode(value);

  return (
    <div className={cn("info-tile", className)}>
      <div className="flex items-start gap-3.5">
        {Icon ? (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-accent/85 text-accent-foreground shadow-[inset_0_1px_0_var(--surface-highlight)]">
            <Icon className="size-4" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="meta-label">
            {plainLabel ? (
              <TruncatedTextWithTooltip text={plainLabel} />
            ) : (
              label
            )}
          </div>
          <div
            className={cn(
              "mt-2 text-base font-semibold leading-snug tracking-tight text-foreground",
              valueClassName,
            )}
          >
            {plainValue ? (
              <TruncatedTextWithTooltip text={plainValue} />
            ) : (
              value
            )}
          </div>
          {description ? (
            <div className="mt-1.5 text-sm leading-5 text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
