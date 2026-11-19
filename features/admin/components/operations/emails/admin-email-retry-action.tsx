"use client";

import { RotateCw } from "lucide-react";
import { useCallback, useState, useTransition } from "react";

import { toast } from "@/components/shared/notify";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmPasswordDialog } from "@/features/admin/components/confirm-password-dialog";
import { retryEmailAction } from "@/features/admin/mutations";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";

type AdminEmailRetryActionProps = {
  emailId: string;
  status: string;
  type: string;
};

/**
 * Password-confirmed retry for a failed transactional email. The server
 * action re-reads the outbox row and refuses auth/unknown/in-flight rows,
 * so this control is only the discoverable entry point.
 */
export function AdminEmailRetryAction({
  emailId,
  status,
  type,
}: AdminEmailRetryActionProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmed = useCallback(
    (confirmToken: string) => {
      setConfirmOpen(false);

      startTransition(async () => {
        const result = await retryEmailAction({ emailId, confirmToken });

        if (result.ok) {
          toast.success(result.message ?? "Email retry queued.");
          scheduleRefresh();
        } else {
          toast.error(result.error);
        }
      });
    },
    [emailId, scheduleRefresh],
  );

  if ((status !== "failed" && status !== "pending") || type === "auth") {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-5">
      <div>
        <p className="text-sm font-medium text-foreground">Retry delivery</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Resends the stored email with the same idempotency key. Check the
          provider status and last error before retrying.
        </p>
      </div>
      <Button
        className="self-start"
        disabled={isPending}
        onClick={() => setConfirmOpen(true)}
        type="button"
        variant="outline"
      >
        {isPending ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <RotateCw data-icon="inline-start" aria-hidden="true" />
        )}
        Retry email
      </Button>
      <ConfirmPasswordDialog
        actionLabel="Retry email"
        confirmLabel="Retry email"
        description="Re-enter your password to authorize another delivery attempt."
        onConfirmed={handleConfirmed}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
      />
    </div>
  );
}
