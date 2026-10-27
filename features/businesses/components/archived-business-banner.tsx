"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, RotateCcw } from "lucide-react";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { useProgressRouter } from "@/hooks/use-progress-router";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import type { BusinessRecordActionState } from "@/features/businesses/types";

type ArchivedBusinessBannerProps = {
  dashboardHref: string;
  unarchiveAction: (
    state: BusinessRecordActionState,
    formData: FormData,
  ) => Promise<BusinessRecordActionState>;
};

const initialState: BusinessRecordActionState = {};

export function ArchivedBusinessBanner({
  dashboardHref,
  unarchiveAction,
}: ArchivedBusinessBannerProps) {
  const [open, setOpen] = useState(false);
  const router = useProgressRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionStateWithSonner(
    unarchiveAction,
    initialState,
  );

  useEffect(() => {
    if (state.success) {
      router.replace(dashboardHref);
    }
  }, [state.success, dashboardHref, router]);

  return (
    <>
      <div className="sticky top-[3.5rem] z-30 flex w-full items-center justify-between gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-warning-ink sm:px-6">
        <div className="flex items-center gap-2">
          <Archive className="size-3.5 shrink-0" />
          <p className="text-xs font-medium sm:text-sm">
            This business is archived and read-only.
          </p>
        </div>
        <button
          className="shrink-0 text-xs font-bold underline sm:text-sm"
          data-allow-archived
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
        title="Restore this business?"
        description="This will make the business active again. You'll be able to manage inquiries, quotes, and settings."
        confirmLabel="Restore"
        onConfirm={() => formRef.current?.requestSubmit()}
        isPending={isPending}
        tone="neutral"
        icon={RotateCcw}
      />
    </>
  );
}
