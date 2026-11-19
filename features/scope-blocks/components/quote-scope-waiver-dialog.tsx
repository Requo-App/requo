"use client";

import { useState, useTransition } from "react";
import { ShieldOff } from "lucide-react";

import { toast } from "@/components/shared/notify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import type { ScopeBlockKind } from "@/lib/db/schema/scope-blocks";

type WaiveScopeAction = (
  previousState: { error?: string; success?: string },
  formData: FormData,
) => Promise<{ error?: string; success?: string }>;

/**
 * Manager-gated waiver for a required scope section. The reason is required
 * and stored on the block plus the audit log, so a waived section is an
 * explicit, attributable omission rather than fabricated content.
 */
export function QuoteScopeWaiverDialog({
  kind,
  blockId,
  waiveAction,
}: {
  kind: ScopeBlockKind;
  blockId: string | null;
  waiveAction: WaiveScopeAction;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { scheduleRefresh } = useDeferredRefresh();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) return;

    if (!reason.trim()) {
      setError("Add a reason for waiving this section.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("kind", kind);
      formData.set("reason", reason);

      const result = await waiveAction({}, formData);

      if (result.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(result.success ?? "Scope section waived.");
      setOpen(false);
      setReason("");
      scheduleRefresh();
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <ShieldOff data-icon="inline-start" />
        Waive section
      </Button>
      <Dialog
        onOpenChange={(next) => {
          if (!isPending) setOpen(next);
        }}
        open={open}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Waive this scope section</DialogTitle>
              <DialogDescription>
                Manager approval is recorded with your reason. The customer
                will not see this section on the quote.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="pt-4">
              <label
                className="grid gap-1.5 text-sm font-medium"
                htmlFor={`waiver-reason-${kind}`}
              >
                Reason
                <Textarea
                  aria-describedby={
                    error ? `waiver-error-${kind}` : undefined
                  }
                  id={`waiver-reason-${kind}`}
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why does this requirement not apply?"
                  value={reason}
                />
              </label>
              {error ? (
                <p
                  className="mt-2 text-sm text-destructive"
                  id={`waiver-error-${kind}`}
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <input name="kind" type="hidden" value={kind} />
              {blockId ? (
                <input name="blockId" type="hidden" value={blockId} />
              ) : null}
            </DialogBody>
            <DialogFooter className="mt-4">
              <Button
                disabled={isPending}
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isPending} type="submit">
                {isPending ? (
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                ) : null}
                Waive section
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
