"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";
import { bulkVoidInvoicesAction } from "@/features/invoices/actions";
import { VoidInvoiceDialog } from "@/features/invoices/components/void-invoice-dialog";
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
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [voidableIds, setVoidableIds] = useState<string[]>([]);

  if (selectedCount === 0) {
    return null;
  }

  function handleOpen() {
    const eligibleIds = filterVoidableInvoiceIds(invoices, ids);

    if (eligibleIds.length === 0) {
      toast.error(
        "Only unpaid, non-voided invoices can be voided. None of the selected invoices are eligible.",
      );
      return;
    }

    setVoidableIds(eligibleIds);
    setConfirmVoid(true);
  }

  function handleConfirm(formData: FormData) {
    formData.set("invoiceIds", voidableIds.join(","));

    onOptimisticRemove?.(voidableIds, async () =>
      bulkVoidInvoicesAction({}, formData),
    );
    onComplete();
    setConfirmVoid(false);
  }

  return (
    <>
      <Button onClick={handleOpen} size="sm" type="button" variant="outline">
        <Ban data-icon="inline-start" />
        Void
      </Button>
      <VoidInvoiceDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title={`Void ${voidableIds.length} invoice${voidableIds.length !== 1 ? "s" : ""}?`}
        description="Voiding keeps each record for audit history but removes it from balances. Invoices with recorded payments are skipped."
        confirmLabel="Void invoices"
        onConfirm={handleConfirm}
      />
    </>
  );
}
