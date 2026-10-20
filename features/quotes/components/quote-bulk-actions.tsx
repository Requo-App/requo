"use client";

import { useState } from "react";
import { Archive, Ban, Trash2 } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";
import { ConfirmationHeader } from "@/components/shared/confirmation-dialog";
import {
  ResponsiveOverlay,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayFooter,
} from "@/components/ui/responsive-overlay";
import {
  bulkArchiveQuotesAction,
  bulkDeleteQuotesAction,
  bulkVoidQuotesAction,
} from "@/features/quotes/actions";
import type { DashboardQuoteListItem } from "@/features/quotes/types";
import type { OptimisticActionResult } from "@/hooks/use-optimistic-mutation";

function isQuoteBulkDeletable(quote: DashboardQuoteListItem) {
  return quote.status === "draft" && !quote.archivedAt;
}

function filterDeletableQuoteIds(
  quotes: DashboardQuoteListItem[],
  ids: string[],
) {
  const idSet = new Set(ids);
  return quotes.filter((quote) => idSet.has(quote.id) && isQuoteBulkDeletable(quote)).map(
    (quote) => quote.id,
  );
}

type QuoteBulkActionsProps = {
  selectedCount: number;
  serializedIds: string;
  quotes: DashboardQuoteListItem[];
  onComplete: () => void;
  onOptimisticRemove?: (
    ids: string[],
    mutation: () => Promise<OptimisticActionResult>,
  ) => void;
};

export function QuoteBulkActions({
  selectedCount,
  serializedIds,
  quotes,
  onComplete,
  onOptimisticRemove,
}: QuoteBulkActionsProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const ids = serializedIds.split(",").filter(Boolean);

  function buildQuoteIdsFormData(targetIds: string[]) {
    const formData = new FormData();
    formData.set("quoteIds", targetIds.join(","));
    return formData;
  }

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
            title={`Archive ${selectedCount} quote${selectedCount !== 1 ? "s" : ""}?`}
            description="Archived quotes are hidden from the active list. You can restore them later."
          />
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button
              onClick={() => {
                onOptimisticRemove?.(ids, async () => {
                  return bulkArchiveQuotesAction({}, buildQuoteIdsFormData(ids));
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

      <ResponsiveOverlay
        open={showVoidDialog}
        onOpenChange={setShowVoidDialog}
      >
        <Button
          onClick={() => setShowVoidDialog(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Ban data-icon="inline-start" />
          Void
        </Button>
        <ResponsiveOverlayContent className="sm:max-w-md">
          <ConfirmationHeader
            tone="destructive"
            icon={Ban}
            title={`Void ${selectedCount} quote${selectedCount !== 1 ? "s" : ""}?`}
            description="A voided quote can no longer be accepted by the customer online. Only sent quotes are voided; the rest are skipped."
          />
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button
              onClick={() => {
                onOptimisticRemove?.(ids, async () => {
                  return bulkVoidQuotesAction({}, buildQuoteIdsFormData(ids));
                });
                setShowVoidDialog(false);
                onComplete();
              }}
              type="button"
              variant="destructive"
            >
              <Ban data-icon="inline-start" />
              Void {selectedCount}
            </Button>
          </ResponsiveOverlayFooter>
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>

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
            title={`Delete ${selectedCount} quote${selectedCount !== 1 ? "s" : ""}`}
            description="Only draft, non-archived quotes will be permanently deleted. Other quotes will be skipped."
          />
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button
              onClick={() => {
                const deletableIds = filterDeletableQuoteIds(quotes, ids);

                if (deletableIds.length === 0) {
                  toast.error(
                    "Only draft, non-archived quotes can be deleted. None of the selected quotes are eligible.",
                  );
                  return;
                }

                const formData = buildQuoteIdsFormData(deletableIds);
                formData.set("confirmed", "true");

                onOptimisticRemove?.(deletableIds, async () =>
                  bulkDeleteQuotesAction({}, formData),
                );
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
