"use client";

import type { ReactNode } from "react";

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
  if (!visible) {
    return null;
  }

  const isClosing = state === "closed";
  const disableCancelButton = isPending;
  const disableSubmitButton = isPending || (!isClosing && disableSubmit);

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-4">
      <div
        data-padding="none"
        className={cn(
          "overlay-surface motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-bottom-2 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=open]:duration-200 motion-safe:data-[state=open]:ease-(--motion-ease-emphasized) motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:slide-out-to-bottom-2 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=closed]:duration-150 motion-safe:data-[state=closed]:ease-(--motion-ease-standard) data-[state=closed]:pointer-events-none motion-reduce:animate-none flex w-full max-w-2xl items-center justify-center sm:justify-between gap-3 border px-4 py-3",
          stackActionsOnMobile &&
            "flex-col items-stretch sm:flex-row sm:items-center",
          className,
        )}
        data-state={state}
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
