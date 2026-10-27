"use client";

import { useEffect, useState } from "react";
import { SendHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/ui/responsive-overlay";
import type { InvoiceActionState } from "@/features/invoices/types";
import { formatQuoteMoney } from "@/features/invoices/utils";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";

type SendInvoiceDialogProps = {
  action: (state: InvoiceActionState, formData: FormData) => Promise<InvoiceActionState>;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string | null;
  totalInCents: number;
  currency: string;
  dueDate: string;
  isRequoEmailAvailable: boolean;
};

export function SendInvoiceDialog({
  action,
  invoiceNumber,
  customerName,
  customerEmail,
  totalInCents,
  currency,
  dueDate,
  isRequoEmailAvailable,
}: SendInvoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"requo" | "manual">(isRequoEmailAvailable && customerEmail ? "requo" : "manual");
  const { scheduleRefresh } = useDeferredRefresh();
  const [state, formAction, pending] = useActionStateWithSonner(action, {});

  useEffect(() => {
    if (state.success) {
      queueMicrotask(() => setOpen(false));
      scheduleRefresh();
    }
  }, [scheduleRefresh, state.success]);

  const totalLabel = formatQuoteMoney(totalInCents, currency);

  return (
    <ResponsiveOverlay open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        size="sm"
        className={mobileNavbarIconButtonClassName}
        aria-label="Send invoice"
        title="Send invoice"
      >
        <SendHorizontal data-icon="inline-start" />
        <span className="hidden lg:inline">Send</span>
      </Button>
      <ResponsiveOverlayContent className="sm:max-w-lg">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Send invoice {invoiceNumber}</ResponsiveOverlayTitle>
        </ResponsiveOverlayHeader>
        <form action={formAction}>
          <ResponsiveOverlayBody className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {customerName} · {totalLabel} · Due {dueDate}
            </p>
            <div className="grid gap-2">
              <Label>Delivery method</Label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-checked:border-primary">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="requo"
                  checked={method === "requo"}
                  onChange={() => setMethod("requo")}
                  disabled={!isRequoEmailAvailable || !customerEmail}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Send with Requo email</span>
                  <span className="mt-1 block text-muted-foreground">
                    {customerEmail
                      ? `Emails the invoice to ${customerEmail}.`
                      : "Add a customer email to use Requo email."}
                    {!isRequoEmailAvailable ? " Email delivery is unavailable right now." : ""}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm has-checked:border-primary">
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="manual"
                  checked={method === "manual"}
                  onChange={() => setMethod("manual")}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Mark as sent manually</span>
                  <span className="mt-1 block text-muted-foreground">
                    Use this after sending the invoice yourself (own email, printed copy, in person).
                  </span>
                </span>
              </label>
            </div>
            {state.error ? (
              <p role="alert" className="text-sm text-destructive-ink">
                {state.error}
              </p>
            ) : null}
          </ResponsiveOverlayBody>
          <ResponsiveOverlayFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || (method === "requo" && (!isRequoEmailAvailable || !customerEmail))}>
              {pending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Sending...
                </>
              ) : method === "requo" ? (
                "Send email"
              ) : (
                "Mark as sent"
              )}
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
