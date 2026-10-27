"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import {
  ResponsiveOverlay,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/ui/responsive-overlay";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type ConfirmationTone = "destructive" | "neutral";

type ConfirmationIconProps = {
  tone?: ConfirmationTone;
  icon: LucideIcon;
  className?: string;
};

export function ConfirmationIcon({
  tone = "neutral",
  icon: Icon,
  className,
}: ConfirmationIconProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border",
        tone === "destructive"
          ? "border-destructive/20 bg-destructive/10 text-destructive-ink"
          : "border-border/70 bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
    </div>
  );
}

type ConfirmationHeaderProps = {
  tone?: ConfirmationTone;
  icon?: LucideIcon;
  title: string;
  description: ReactNode;
};

export function ConfirmationHeader({
  tone = "neutral",
  icon: Icon,
  title,
  description,
}: ConfirmationHeaderProps) {
  return (
    <ResponsiveOverlayHeader className="flex flex-row items-start gap-3 text-left">
      {Icon ? <ConfirmationIcon tone={tone} icon={Icon} /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <ResponsiveOverlayTitle>{title}</ResponsiveOverlayTitle>
        <ResponsiveOverlayDescription>{description}</ResponsiveOverlayDescription>
      </div>
    </ResponsiveOverlayHeader>
  );
}

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  isPending?: boolean;
  tone?: ConfirmationTone;
  icon: LucideIcon;
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  isPending = false,
  tone = "neutral",
  icon: Icon,
}: ConfirmationDialogProps) {
  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <ConfirmationHeader
          tone={tone}
          icon={Icon}
          title={title}
          description={description}
        />
        <ResponsiveOverlayFooter>
          <ResponsiveOverlayClose asChild>
            <Button disabled={isPending} type="button" variant="outline">
              Cancel
            </Button>
          </ResponsiveOverlayClose>
          <Button
            disabled={isPending}
            onClick={onConfirm}
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
          >
            {isPending ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden="true" />
                {confirmLabel}
              </>
            ) : (
              <>
                <Icon data-icon="inline-start" aria-hidden="true" />
                {confirmLabel}
              </>
            )}
          </Button>
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
