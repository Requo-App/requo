"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, RotateCcw } from "lucide-react";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { useProgressRouter } from "@/hooks/use-progress-router";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";

type ArchivedRecordBannerProps = {
  /** Label for the record type, e.g. "inquiry" or "quote". */
  recordLabel: string;
  /** Where to navigate after a successful restore. */
  redirectHref: string;
  /** Server action to unarchive the record. */
  unarchiveAction: (
    state: { error?: string; success?: string },
    formData: FormData,
  ) => Promise<{ error?: string; success?: string }>;
};

const initialState: { error?: string; success?: string } = {};

export function ArchivedRecordBanner({
  recordLabel,
  redirectHref,
  unarchiveAction,
}: ArchivedRecordBannerProps) {
  const [open, setOpen] = useState(false);
  const router = useProgressRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionStateWithSonner(
    unarchiveAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      router.replace(redirectHref);
    }
  }, [state.success, redirectHref, router]);

  return (
    <>
      <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2.5 text-warning-ink">
        <div className="flex items-center gap-2">
          <Archive className="size-3.5 shrink-0" />
          <p className="text-xs font-medium sm:text-sm">
            This {recordLabel} is archived and read-only.
          </p>
        </div>
        <button
          className="shrink-0 text-xs font-bold underline sm:text-sm"
          type="button"
          onClick={() => setOpen(true)}
        >
          Restore
        </button>
      </div>

      <form ref={formRef} action={formAction} className="hidden" />
      <ConfirmationDialog
        open={open}
        onOpenChange={setOpen}
        title={`Restore this ${recordLabel}?`}
        description={`This will make the ${recordLabel} active again so you can manage it normally.`}
        confirmLabel={`Restore ${recordLabel}`}
        onConfirm={() => formRef.current?.requestSubmit()}
        isPending={isPending}
        tone="neutral"
        icon={RotateCcw}
      />
    </>
  );
}
