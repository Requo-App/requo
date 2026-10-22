"use client";

import { Archive, CreditCard, OctagonMinus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useState, useTransition } from "react";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmPasswordDialog } from "@/features/admin/components/confirm-password-dialog";
import {
  archiveBusinessAction,
  cancelBusinessSubscriptionAction,
  deleteBusinessAction,
  overridePlanTierAction,
  restoreBusinessAction,
} from "@/features/admin/mutations";
import type { AdminActionResult } from "@/features/admin/types";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import type { SubscriptionStatus } from "@/lib/billing/types";
import { planMeta, type PlanTier } from "@/lib/plans/plans";

export type AdminBusinessToolbarStatus = "active" | "archived" | "deleted";

type AdminBusinessToolbarProps = {
  businessId: string;
  businessName: string;
  status: AdminBusinessToolbarStatus;
  /**
   * The business's subscription, or null when on the free plan. Drives
   * the plan-modal default and whether Cancel is available.
   */
  subscription: {
    plan: string;
    status: SubscriptionStatus;
  } | null;
};

type InputModal = "plan" | "cancel" | null;

type PendingConfirm = {
  kind: "plan" | "cancel" | "archive" | "restore" | "delete";
  label: string;
  description?: string;
  confirmLabel: string;
  plan?: Exclude<PlanTier, "free">;
  reason?: string;
};

const OVERRIDABLE_PLANS: ReadonlyArray<Exclude<PlanTier, "free">> = [
  "pro",
  "business",
];

/**
 * Action toolbar for `/admin/businesses/[businessId]`, rendered in the
 * header. Every action runs behind a modal: plan/cancel collect input
 * first, then all five flow through the password re-confirmation
 * dialog before calling their server action.
 *
 * Lifecycle is soft state only (archive / restore / soft-delete) —
 * there is no admin hard-delete. Subscription writes go through the
 * business-scoped subscription service, the same path as checkout.
 */
export function AdminBusinessToolbar({
  businessId,
  businessName,
  status,
  subscription,
}: AdminBusinessToolbarProps) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [isPending, startTransition] = useTransition();
  const [inputModal, setInputModal] = useState<InputModal>(null);
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingConfirm | null>(null);

  const [plan, setPlan] = useState<Exclude<PlanTier, "free">>(
    subscription && OVERRIDABLE_PLANS.includes(subscription.plan as Exclude<PlanTier, "free">)
      ? (subscription.plan as Exclude<PlanTier, "free">)
      : "pro",
  );
  const [planReason, setPlanReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const canCancel =
    subscription !== null &&
    subscription.status !== "canceled" &&
    subscription.status !== "expired";

  const handleResult = useCallback(
    (result: AdminActionResult, fallbackSuccess: string) => {
      if (result.ok) {
        toast.success(result.message ?? fallbackSuccess);
        scheduleRefresh();
      } else {
        toast.error(result.error);
      }
    },
    [scheduleRefresh],
  );

  const runConfirmed = useCallback(
    (token: string) => {
      const queued = pendingConfirm;
      if (!queued) {
        return;
      }

      setPendingConfirm(null);

      startTransition(async () => {
        switch (queued.kind) {
          case "plan": {
            const result = await overridePlanTierAction({
              businessId,
              plan: queued.plan ?? "pro",
              reason: queued.reason || undefined,
              confirmToken: token,
            });
            handleResult(result, `Updated ${businessName}.`);
            return;
          }
          case "cancel": {
            const result = await cancelBusinessSubscriptionAction({
              businessId,
              reason: queued.reason || undefined,
              confirmToken: token,
            });
            handleResult(result, `Canceled ${businessName}'s subscription.`);
            return;
          }
          case "archive": {
            const result = await archiveBusinessAction({
              businessId,
              confirmToken: token,
            });
            handleResult(result, `Archived ${businessName}.`);
            return;
          }
          case "restore": {
            const result = await restoreBusinessAction({
              businessId,
              confirmToken: token,
            });
            handleResult(result, `Restored ${businessName}.`);
            return;
          }
          case "delete": {
            const result = await deleteBusinessAction({
              businessId,
              confirmToken: token,
            });
            handleResult(result, `Deleted ${businessName}.`);
            return;
          }
        }
      });
    },
    [businessId, businessName, handleResult, pendingConfirm],
  );

  const askConfirm = useCallback((next: PendingConfirm) => {
    setInputModal(null);
    setPendingConfirm(next);
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={isPending}
          onClick={() => setInputModal("plan")}
          type="button"
          variant="outline"
        >
          <CreditCard data-icon="inline-start" aria-hidden="true" />
          Change plan
        </Button>

        <Button
          disabled={isPending || !canCancel}
          onClick={() => setInputModal("cancel")}
          title={
            canCancel
              ? undefined
              : "No active subscription to cancel on this business."
          }
          type="button"
          variant="outline"
        >
          <OctagonMinus data-icon="inline-start" aria-hidden="true" />
          Cancel subscription
        </Button>

        {status === "active" ? (
          <Button
            disabled={isPending}
            onClick={() =>
              askConfirm({
                kind: "archive",
                label: "Archive",
                description: `${businessName} becomes read-only and hides from active views. Reversible.`,
                confirmLabel: "Archive",
              })
            }
            type="button"
            variant="outline"
          >
            {isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Archive data-icon="inline-start" aria-hidden="true" />
            )}
            Archive
          </Button>
        ) : (
          <Button
            disabled={isPending}
            onClick={() =>
              askConfirm({
                kind: "restore",
                label: "Restore",
                description: `${businessName} becomes active again.`,
                confirmLabel: "Restore",
              })
            }
            type="button"
            variant="outline"
          >
            {isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
            )}
            Restore
          </Button>
        )}

        {status !== "deleted" ? (
          <Button
            disabled={isPending}
            onClick={() =>
              askConfirm({
                kind: "delete",
                label: "Delete",
                description: `${businessName} is soft-deleted and drops out of lists. Restorable from this page — no data is removed.`,
                confirmLabel: "Delete",
              })
            }
            type="button"
            variant="destructive"
          >
            {isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Trash2 data-icon="inline-start" aria-hidden="true" />
            )}
            Delete
          </Button>
        ) : null}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setInputModal(null);
          }
        }}
        open={inputModal !== null}
      >
        <DialogContent className="sm:max-w-md">
          {inputModal === "plan" ? (
            <>
              <DialogHeader>
                <DialogTitle>Change plan</DialogTitle>
                <DialogDescription>
                  Set {businessName} to a paid plan. Takes effect
                  immediately.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <FieldGroup>
                  <Field>
                    <FieldLabel>Plan</FieldLabel>
                    <FieldContent>
                      <RadioGroup
                        className="flex flex-col gap-2"
                        onValueChange={(value) =>
                          setPlan(value as Exclude<PlanTier, "free">)
                        }
                        value={plan}
                      >
                        {OVERRIDABLE_PLANS.map((option) => (
                          <div
                            className="flex items-center gap-2.5"
                            key={option}
                          >
                            <RadioGroupItem id={`plan-${option}`} value={option} />
                            <Label htmlFor={`plan-${option}`}>
                              {planMeta[option].label}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </FieldContent>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="business-plan-reason">
                      Reason{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="business-plan-reason"
                        onChange={(event) => setPlanReason(event.target.value)}
                        placeholder="Why is support changing this plan?"
                        rows={2}
                        value={planReason}
                      />
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </DialogBody>
              <DialogFooter>
                <Button
                  onClick={() => setInputModal(null)}
                  type="button"
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    askConfirm({
                      kind: "plan",
                      label: `Change plan to ${planMeta[plan].label}`,
                      description: `${businessName} moves to ${planMeta[plan].label} immediately.`,
                      confirmLabel: "Change plan",
                      plan,
                      reason: planReason.trim() || undefined,
                    })
                  }
                  type="button"
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {inputModal === "cancel" ? (
            <>
              <DialogHeader>
                <DialogTitle>Cancel subscription</DialogTitle>
                <DialogDescription>
                  {businessName} keeps paid access until the end of the
                  billing period, then falls back to free.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="business-cancel-reason">
                      Reason{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="business-cancel-reason"
                        onChange={(event) => setCancelReason(event.target.value)}
                        placeholder="Why is support canceling this subscription?"
                        rows={2}
                        value={cancelReason}
                      />
                      <FieldDescription>
                        Recorded on the audit row.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </DialogBody>
              <DialogFooter>
                <Button
                  onClick={() => setInputModal(null)}
                  type="button"
                  variant="ghost"
                >
                  Keep subscription
                </Button>
                <Button
                  onClick={() =>
                    askConfirm({
                      kind: "cancel",
                      label: "Cancel subscription",
                      description: `${businessName} keeps paid access until the period ends.`,
                      confirmLabel: "Cancel subscription",
                      reason: cancelReason.trim() || undefined,
                    })
                  }
                  type="button"
                  variant="destructive"
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmPasswordDialog
        actionLabel={pendingConfirm?.label ?? ""}
        confirmLabel={pendingConfirm?.confirmLabel}
        description={pendingConfirm?.description}
        onConfirmed={runConfirmed}
        onOpenChange={(open) => {
          if (!open) {
            setPendingConfirm(null);
          }
        }}
        open={pendingConfirm !== null}
      />
    </>
  );
}
