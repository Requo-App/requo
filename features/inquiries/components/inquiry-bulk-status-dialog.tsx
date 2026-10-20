"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { OptimisticPendingIndicator } from "@/components/shared/optimistic-pending-indicator";
import { Button } from "@/components/ui/button";
import {
  ResponsiveOverlay,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/ui/responsive-overlay";
import type { InquiryWorkflowStatus } from "@/features/inquiries/types";
import { inquiryWorkflowStatuses } from "@/features/inquiries/types";
import { getInquiryStatusLabel } from "@/features/inquiries/utils";
import { cn } from "@/lib/utils";

const statusOptions = inquiryWorkflowStatuses;

type InquiryBulkStatusDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serializedIds: string;
  selectedCount: number;
  onSubmit: (formData: FormData) => void | Promise<void>;
  isPending?: boolean;
};

export function InquiryBulkStatusDialog({
  open,
  onOpenChange,
  serializedIds,
  selectedCount,
  onSubmit,
  isPending,
}: InquiryBulkStatusDialogProps) {
  const [targetStatus, setTargetStatus] = useState<InquiryWorkflowStatus | null>(null);

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setTargetStatus(null);
        onOpenChange(nextOpen);
      }}
    >
      <Button
        onClick={() => onOpenChange(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw data-icon="inline-start" />
        Change status
      </Button>
      <ResponsiveOverlayContent className="sm:max-w-sm">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>
            Change status for {selectedCount} inquiry{selectedCount !== 1 ? "ies" : ""}
          </ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Pick a target status. Archived or deleted inquiries will be skipped.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <div>
          <div
            aria-label="Target status"
            className="flex flex-col gap-1.5 px-4 pb-4 sm:px-6 sm:pb-6"
            role="radiogroup"
          >
            {statusOptions.map((status) => (
              <button
                aria-checked={targetStatus === status}
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  targetStatus === status && "bg-accent ring-1 ring-ring/30",
                )}
                key={status}
                onClick={() => setTargetStatus(status)}
                role="radio"
                type="button"
              >
                {getInquiryStatusLabel(status)}
              </button>
            ))}
          </div>
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button disabled={isPending} type="button" variant="ghost">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button
              disabled={isPending || !targetStatus}
              onClick={() => {
                if (!targetStatus) {
                  return;
                }

                const formData = new FormData();
                formData.set("inquiryIds", serializedIds);
                formData.set("targetStatus", targetStatus);
                void onSubmit(formData);
              }}
              type="button"
            >
              <OptimisticPendingIndicator pending={isPending} />
              <RefreshCw data-icon="inline-start" />
              Update status
            </Button>
          </ResponsiveOverlayFooter>
        </div>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
