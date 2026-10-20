"use client";

import { useState } from "react";
import { Archive, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmationHeader } from "@/components/shared/confirmation-dialog";
import {
  ResponsiveOverlay,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayFooter,
} from "@/components/ui/responsive-overlay";
import {
  bulkArchiveInquiriesAction,
  bulkChangeInquiryStatusAction,
  bulkDeleteInquiriesAction,
} from "@/features/inquiries/actions";
import { InquiryBulkStatusDialog } from "@/features/inquiries/components/inquiry-bulk-status-dialog";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import type { OptimisticActionResult } from "@/hooks/use-optimistic-mutation";

type InquiryBulkActionsProps = {
  selectedCount: number;
  serializedIds: string;
  onComplete: () => void;
  onOptimisticRemove?: (
    ids: string[],
    mutation: () => Promise<OptimisticActionResult>,
  ) => void;
};

export function InquiryBulkActions({
  selectedCount,
  serializedIds,
  onComplete,
  onOptimisticRemove,
}: InquiryBulkActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const { runMutation, isPending: isStatusPending } = useOptimisticMutation();

  const ids = serializedIds.split(",").filter(Boolean);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <>
      <ResponsiveOverlay
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
      >
        <Button
          onClick={() => setShowArchiveDialog(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Archive data-icon="inline-start" />
          Archive
        </Button>
        <ResponsiveOverlayContent className="sm:max-w-md">
          <ConfirmationHeader
            tone="neutral"
            icon={Archive}
            title={`Archive ${selectedCount} inquir${selectedCount !== 1 ? "ies" : "y"}?`}
            description="Archived inquiries are hidden from the active list. You can restore them later."
          />
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button
              onClick={() => {
                const targetIds = [...ids];
                const targetSerializedIds = targetIds.join(",");
                onOptimisticRemove?.(targetIds, async () => {
                  const formData = new FormData();
                  formData.set("inquiryIds", targetSerializedIds);
                  return bulkArchiveInquiriesAction({}, formData);
                });
                setShowArchiveDialog(false);
                onComplete();
              }}
              type="button"
            >
              <Archive data-icon="inline-start" />
              Archive {selectedCount}
            </Button>
          </ResponsiveOverlayFooter>
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>

      <InquiryBulkStatusDialog
        open={showStatusDialog}
        onOpenChange={setShowStatusDialog}
        serializedIds={serializedIds}
        selectedCount={selectedCount}
        isPending={isStatusPending}
        onSubmit={(formData) => {
          // A status change keeps the row in the list — only archive and
          // delete remove it. Optimistically removing the rows here made
          // records vanish and reappear a moment later with a new badge.
          runMutation({
            applyOptimistic: () => {},
            revertOptimistic: () => {},
            mutation: () => bulkChangeInquiryStatusAction({}, formData),
            pendingKey: "inquiry-bulk-status",
          });
          setShowStatusDialog(false);
          onComplete();
        }}
      />

      <ResponsiveOverlay
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      >
        <Button
          onClick={() => setShowDeleteDialog(true)}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Trash2 data-icon="inline-start" />
          Delete
        </Button>
        <ResponsiveOverlayContent className="sm:max-w-md">
          <ConfirmationHeader
            tone="destructive"
            icon={Trash2}
            title={`Delete ${selectedCount} inquir${selectedCount !== 1 ? "ies" : "y"}?`}
            description="This permanently deletes the selected inquiries. Already-deleted inquiries will be skipped."
          />
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button
              onClick={() => {
                const targetIds = [...ids];
                const targetSerializedIds = targetIds.join(",");
                onOptimisticRemove?.(targetIds, async () => {
                  const formData = new FormData();
                  formData.set("inquiryIds", targetSerializedIds);
                  return bulkDeleteInquiriesAction({}, formData);
                });
                setShowDeleteDialog(false);
                onComplete();
              }}
              type="button"
              variant="destructive"
            >
              <Trash2 data-icon="inline-start" />
              Delete {selectedCount}
            </Button>
          </ResponsiveOverlayFooter>
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>
    </>
  );
}
