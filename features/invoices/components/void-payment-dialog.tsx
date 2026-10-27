"use client";

import { startTransition, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveOverlay, ResponsiveOverlayBody, ResponsiveOverlayContent, ResponsiveOverlayFooter, ResponsiveOverlayHeader, ResponsiveOverlayTitle } from "@/components/ui/responsive-overlay";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { voidReasonLabels, voidReasonValues } from "@/features/invoices/void-reasons";
import type { PaymentActionState } from "@/features/invoices/types";

export function VoidPaymentDialog({ paymentNumber, action, onOptimisticVoid, onOptimisticRevertVoid }: { paymentNumber: string; action: (state: PaymentActionState, formData: FormData) => Promise<PaymentActionState>; onOptimisticVoid?: () => void; onOptimisticRevertVoid?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof voidReasonValues)[number]>("duplicate_entry");
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, pending] = useActionStateWithSonner(action, {});
  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => setOpen(false));
      scheduleRefresh();
    }
  }, [scheduleRefresh, state.success]);
  useEffect(() => {
    if (state.error) startTransition(() => onOptimisticRevertVoid?.());
  }, [onOptimisticRevertVoid, state.error]);

  return (
    <ResponsiveOverlay open={open} onOpenChange={setOpen}>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>Void</Button>
      <ResponsiveOverlayContent className="sm:max-w-lg">
        <ResponsiveOverlayHeader><ResponsiveOverlayTitle>Void payment {paymentNumber}?</ResponsiveOverlayTitle></ResponsiveOverlayHeader>
        <form
          action={formAction}
          onSubmit={() => {
            startTransition(() => onOptimisticVoid?.());
          }}
        >
          <ResponsiveOverlayBody className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Voiding keeps the payment record for audit history but excludes it from the invoice balance.
            </p>
            <div className="grid gap-2">
              <Label htmlFor={`void-reason-${paymentNumber}`}>Reason</Label>
              <input name="reason" type="hidden" value={reason} />
              <Combobox
                id={`void-reason-${paymentNumber}`}
                value={reason}
                onValueChange={(value) => setReason(value as typeof reason)}
                options={voidReasonValues.map((value) => ({ value, label: voidReasonLabels[value] }))}
                placeholder="Choose reason"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`void-detail-${paymentNumber}`}>Details <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea id={`void-detail-${paymentNumber}`} name="reasonDetail" rows={2} />
            </div>
            {state.error ? <p role="alert" className="text-sm text-destructive-ink">{state.error}</p> : null}
          </ResponsiveOverlayBody>
          <ResponsiveOverlayFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={pending}>{pending ? (<><Spinner data-icon="inline-start" aria-hidden="true" />Voiding...</>) : "Void payment"}</Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
