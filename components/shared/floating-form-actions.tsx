"use client";

import type { ReactNode } from "react";

import { useOverlayPresence } from "@/components/ui/overlay-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type FloatingFormActionsProps = {
  visible: boolean;
  state: "open" | "closed";
  isPending: boolean;
  disableSubmit?: boolean;
  message?: string;
  cancelLabel?: string;
  submitLabel?: string;
  submitPendingLabel?: string;
  onCancel: () => void;
  className?: string;
  extraAction?: ReactNode;
  stackActionsOnMobile?: boolean;
};

export function useFloatingUnsavedChanges(hasUnsavedChanges: boolean) {
  return {
    shouldRenderFloatingActions: hasUnsavedChanges,
    floatingActionsState: hasUnsavedChanges
      ? ("open" as const)
      : ("closed" as const),
  };
}

export function FloatingFormActions({
  visible,
  state,
  isPending,
  disableSubmit = false,
  message = "You have unsaved changes.",
  cancelLabel = "Cancel",
  submitLabel = "Save changes",
  submitPendingLabel = "Saving...",
  onCancel,
  className,
  extraAction,
  stackActionsOnMobile = false,
}: FloatingFormActionsProps) {
  // Keep the bar mounted briefly after `visible` drops so the exit animation
  // can play instead of disappearing in one frame.
  const present = useOverlayPresence(visible, 200);

  if (!present) {
    return null;
  }

  const isClosing = !visible || state === "closed";
  const disableCancelButton = isPending;
  const disableSubmitButton = isPending || disableSubmit;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-4">
      <div
        inert={isClosing}
        data-padding="none"
        className={cn(
          "overlay-surface motion-floating-bar flex w-full max-w-2xl items-center justify-center gap-3 border px-4 py-3 sm:justify-between",
          stackActionsOnMobile &&
            "flex-col items-stretch sm:flex-row sm:items-center",
          className,
        )}
        data-state={isClosing ? "closed" : "open"}
      >
        <p className="hidden sm:block text-sm text-muted-foreground">{message}</p>
        <div
          className={cn(
            "flex items-center gap-2",
            stackActionsOnMobile && "flex-col sm:flex-row",
          )}
        >
          {extraAction ? (
            <div className={cn(stackActionsOnMobile && "w-full sm:w-auto [&>*]:w-full sm:[&>*]:w-auto")}>
              {extraAction}
            </div>
          ) : null}
          <Button
            disabled={disableCancelButton}
            onClick={onCancel}
            type="button"
            variant="outline"
            className={cn(stackActionsOnMobile && "w-full sm:w-auto")}
          >
            {cancelLabel}
          </Button>
          <Button
            className={cn(stackActionsOnMobile && "w-full sm:w-auto")}
            disabled={disableSubmitButton}
            size="lg"
            type="submit"
          >
            {isPending ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden="true" />
                {submitPendingLabel}
              </>
            ) : (
              submitLabel
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
