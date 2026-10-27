"use client";

import { startTransition, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { cn } from "@/lib/utils";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveOverlay, ResponsiveOverlayBody, ResponsiveOverlayContent, ResponsiveOverlayDescription, ResponsiveOverlayFooter, ResponsiveOverlayHeader, ResponsiveOverlayTitle } from "@/components/ui/responsive-overlay";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { paymentMethods, type OptimisticPayment, type PaymentActionState } from "@/features/invoices/types";
import { parseMoneyToCents, paymentMethodLabels } from "@/features/invoices/utils";
import type { PaymentMethod } from "@/lib/db/schema/invoices";

export function RecordPaymentDialog({ balanceInCents, currency, invoiceNumber, customerName, action, onOptimisticRecord, onOptimisticRevert, compactOnMobile = false }: { balanceInCents: number; currency: string; invoiceNumber: string; customerName: string; action: (state: PaymentActionState, formData: FormData) => Promise<PaymentActionState>; onOptimisticRecord?: (payment: OptimisticPayment) => void; onOptimisticRevert?: (key: string) => void; /**
   * Collapse the trigger to an icon-only navbar button below `lg`
   * (list-page header treatment). Only set for header instances portaled
   * via `MobileHeaderSlot` — body instances keep their full label.
   */
  compactOnMobile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  function handleOpen() {
    setIdempotencyKey(crypto.randomUUID());
    setOpen(true);
  }
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!onOptimisticRecord || !idempotencyKey) return;
    const formData = new FormData(event.currentTarget);
    const amountInCents = parseMoneyToCents(String(formData.get("amount") ?? ""));
    if (!Number.isInteger(amountInCents) || amountInCents <= 0) return;
    const rawMethod = String(formData.get("method") ?? "cash");
    const paymentDate = String(formData.get("paymentDate") ?? new Date().toISOString().slice(0, 10));
    const pendingPayment: OptimisticPayment = {
      id: `pending-${idempotencyKey}`,
      optimisticKey: idempotencyKey,
      paymentNumber: "Pending",
      amountInCents,
      paymentDate,
      method: (paymentMethods as readonly string[]).includes(rawMethod) ? (rawMethod as PaymentMethod) : "cash",
      reference: String(formData.get("reference") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      createdByName: null,
      createdAt: new Date(),
      voidedAt: null,
      voidReason: null,
      source: "manual",
      pending: true,
    };
    startTransition(() => onOptimisticRecord(pendingPayment));
  }
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, pending] = useActionStateWithSonner(action, {});
  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => setOpen(false));
      scheduleRefresh();
    }
  }, [scheduleRefresh, state.success]);
  useEffect(() => {
    if (state.error && idempotencyKey) startTransition(() => onOptimisticRevert?.(idempotencyKey));
  }, [idempotencyKey, onOptimisticRevert, state.error]);
  const defaultDate = new Date().toISOString().slice(0, 10);
  const balanceLabel = new Intl.NumberFormat(undefined, { style: "currency", currency }).format(balanceInCents / 100);
  const notesRequired = method === "other";

  return (
    <ResponsiveOverlay open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        onClick={handleOpen}
        disabled={balanceInCents <= 0}
        size={compactOnMobile ? "sm" : undefined}
        className={compactOnMobile ? cn(mobileNavbarIconButtonClassName) : undefined}
        aria-label={compactOnMobile ? "Record payment" : undefined}
        title={compactOnMobile ? "Record payment" : undefined}
      >
        <CreditCard data-icon="inline-start" />
        {compactOnMobile ? (
          <span className="hidden lg:inline">Record payment</span>
        ) : (
          "Record payment"
        )}
      </Button>
      <ResponsiveOverlayContent className="sm:max-w-lg">
        <ResponsiveOverlayHeader><ResponsiveOverlayTitle>Record payment</ResponsiveOverlayTitle><ResponsiveOverlayDescription>{invoiceNumber} · {customerName}</ResponsiveOverlayDescription></ResponsiveOverlayHeader>
        <form action={formAction} key={open ? idempotencyKey : "closed"} onSubmit={handleSubmit}>
          <ResponsiveOverlayBody className="gap-3">
            <p className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Balance due: <span className="font-semibold text-foreground">{balanceLabel}</span></p>
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
            <input type="hidden" name="currency" value={currency} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" name="amount" inputMode="decimal" placeholder="0.00" required aria-invalid={Boolean(state.fieldErrors?.amountInCents)} /></div>
              <div className="grid gap-2"><Label htmlFor="payment-date">Payment date</Label><Input id="payment-date" name="paymentDate" type="date" defaultValue={defaultDate} required /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="payment-method">Method</Label><input name="method" type="hidden" value={method} /><Combobox id="payment-method" value={method} onValueChange={(value) => setMethod(value as PaymentMethod)} options={paymentMethods.map((value) => ({ value, label: paymentMethodLabels[value] }))} placeholder="Choose method" /></div>
              <div className="grid gap-2"><Label htmlFor="payment-reference">Reference <span className="text-muted-foreground">(optional)</span></Label><Input id="payment-reference" name="reference" placeholder={method === "cash" ? "Optional" : "E.g. BDO-829183"} /></div>
            </div>
            <div className="grid gap-2"><Label htmlFor="payment-notes">Notes {notesRequired ? null : <span className="text-muted-foreground">(optional)</span>}</Label><Textarea id="payment-notes" name="notes" rows={2} required={notesRequired} placeholder={notesRequired ? "Describe how this payment was received." : undefined} aria-invalid={Boolean(state.fieldErrors?.notes)} /></div>
            {state.error ? <p role="alert" className="text-sm text-destructive-ink">{state.error}</p> : null}
          </ResponsiveOverlayBody>
          <ResponsiveOverlayFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? (<><Spinner data-icon="inline-start" aria-hidden="true" />Recording...</>) : "Record payment"}</Button></ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
