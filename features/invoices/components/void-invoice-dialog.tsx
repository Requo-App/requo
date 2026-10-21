"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/ui/responsive-overlay";
import {
  voidReasonLabels,
  voidReasonValues,
  type VoidReasonValue,
} from "@/features/invoices/void-reasons";

type VoidInvoiceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  isPending?: boolean;
  /** Receives the chosen reason; the caller owns the mutation. */
  onConfirm: (formData: FormData) => void;
};

/**
 * Void reason picker for invoices.
 *
 * Voiding excludes a record from balances but keeps it for audit history, so
 * the reason is mandatory — the same rule payment voids follow. The dialog
 * only collects the reason; the caller runs the mutation so it can keep its
 * own optimistic and toast behaviour.
 */
export function VoidInvoiceDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  isPending = false,
  onConfirm,
}: VoidInvoiceDialogProps) {
  const [reason, setReason] = useState<VoidReasonValue>("duplicate_entry");
  const [reasonDetail, setReasonDetail] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData();
    formData.set("reason", reason);
    formData.set("reasonDetail", reasonDetail.trim());

    onConfirm(formData);
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={onOpenChange}>
      <ResponsiveOverlayContent className="sm:max-w-lg">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>{title}</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>{description}</ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <form onSubmit={handleSubmit}>
          <ResponsiveOverlayBody className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="void-invoice-reason">Reason</Label>
              <Combobox
                id="void-invoice-reason"
                value={reason}
                onValueChange={(value) => setReason(value as VoidReasonValue)}
                options={voidReasonValues.map((value) => ({
                  value,
                  label: voidReasonLabels[value],
                }))}
                placeholder="Choose reason"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="void-invoice-detail">
                Details <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="void-invoice-detail"
                name="reasonDetail"
                onChange={(event) => setReasonDetail(event.currentTarget.value)}
                rows={2}
                value={reasonDetail}
              />
            </div>
          </ResponsiveOverlayBody>
          <ResponsiveOverlayFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Voiding...
                </>
              ) : (
                confirmLabel
              )}
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
