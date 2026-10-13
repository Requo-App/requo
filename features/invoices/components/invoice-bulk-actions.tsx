"use client";

import { Ban } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";
import { bulkVoidInvoicesAction } from "@/features/invoices/actions";
import type { InvoiceListItem } from "@/features/invoices/types";
import type { OptimisticActionResult } from "@/hooks/use-optimistic-mutation";

function isInvoiceBulkVoidable(invoice: InvoiceListItem) {
  return invoice.status !== "voided" && invoice.paidInCents <= 0;
}

function filterVoidableInvoiceIds(
  invoices: InvoiceListItem[],
  ids: string[],
) {
  const idSet = new Set(ids);
  return invoices
    .filter((invoice) => idSet.has(invoice.id) && isInvoiceBulkVoidable(invoice))
    .map((invoice) => invoice.id);
}

type InvoiceBulkActionsProps = {
  selectedCount: number;
  serializedIds: string;
  invoices: InvoiceListItem[];
  onComplete: () => void;
  onOptimisticRemove?: (
    ids: string[],
    mutation: () => Promise<OptimisticActionResult>,
  ) => void;
};

export function InvoiceBulkActions({
  selectedCount,
  serializedIds,
  invoices,
  onComplete,
  onOptimisticRemove,
}: InvoiceBulkActionsProps) {
  const ids = serializedIds.split(",").filter(Boolean);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <Button
      onClick={() => {
        const voidableIds = filterVoidableInvoiceIds(invoices, ids);

        if (voidableIds.length === 0) {
          toast.error(
            "Only unpaid, non-voided invoices can be voided. None of the selected invoices are eligible.",
          );
          return;
        }

        const formData = new FormData();
        formData.set("invoiceIds", voidableIds.join(","));

        onOptimisticRemove?.(voidableIds, async () =>
          bulkVoidInvoicesAction({}, formData),
        );
        onComplete();
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      <Ban data-icon="inline-start" />
      Void
    </Button>
  );
}
