"use client";

import {
  CheckCircle2,
  LogOut,
  OctagonMinus,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserCog,
  UserRoundCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useRef, useState, useTransition } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConfirmPasswordDialog } from "@/features/admin/components/confirm-password-dialog";
import {
  deleteUserAction,
  demoteFromAdminAction,
  forceVerifyEmailAction,
  promoteToAdminAction,
  revokeAllSessionsAction,
  suspendUserAction,
  unsuspendUserAction,
} from "@/features/admin/mutations";
import {
  ADMIN_USERS_PATH,
  getAdminStartImpersonationPath,
} from "@/features/admin/navigation";
import type { AdminActionResult } from "@/features/admin/types";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { useProgressRouter } from "@/hooks/use-progress-router";

type AdminUserToolbarProps = {
  targetUserId: string;
  targetEmail: string;
  targetIsSuspended: boolean;
  targetEmailVerified: boolean;
  targetIsAdmin: boolean;
  /**
   * Whether demoting the target is allowed (false when the target is
   * the last remaining admin). Passed from the server after a count
   * check so the button can be disabled preemptively.
   */
  canDemoteTarget: boolean;
  /** Acting admin's id, for the self-target guard. */
  adminUserId: string;
};

type InputModal = "suspend" | null;

type PendingConfirm = {
  kind:
    | "verify"
    | "revoke"
    | "suspend"
    | "unsuspend"
    | "promote"
    | "demote"
    | "impersonate"
    | "delete";
  label: string;
  description?: string;
  confirmLabel: string;
  reason?: string;
};

/**
 * Action toolbar for `/admin/users/[userId]`, rendered in the header.
 *
 * Account lifecycle (verify, revoke, suspend, promote, impersonate,
 * delete) plus the subscription overrides (plan change, force cancel).
 * Suspend / plan / cancel collect input in a modal first; everything
 * flows through the password re-confirmation dialog before calling
 * its server action — the same shape as the business toolbar.
 *
 * Self-target buttons render disabled with an explanatory tooltip
 * instead of being hidden, so the surface stays discoverable.
 */
export function AdminUserToolbar({
  targetUserId,
  targetEmail,
  targetIsSuspended,
  targetEmailVerified,
  targetIsAdmin,
  canDemoteTarget,
  adminUserId,
}: AdminUserToolbarProps) {
  const router = useProgressRouter();
  const { scheduleRefresh } = useDeferredRefresh();
  const [isPending, startTransition] = useTransition();
  const [inputModal, setInputModal] = useState<InputModal>(null);
  const [pendingConfirm, setPendingConfirm] =
    useState<PendingConfirm | null>(null);
  const impersonateFormRef = useRef<HTMLFormElement | null>(null);
  const impersonateTokenInputRef = useRef<HTMLInputElement | null>(null);

  const [suspendReason, setSuspendReason] = useState("");

  const isSelf = targetUserId === adminUserId;

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

      if (queued.kind === "impersonate") {
        // Route impersonation through the existing POST handler so
        // the session swap + redirect happens server-side.
        if (impersonateTokenInputRef.current && impersonateFormRef.current) {
          impersonateTokenInputRef.current.value = token;
          impersonateFormRef.current.requestSubmit();
        }
        return;
      }

      startTransition(async () => {
        switch (queued.kind) {
          case "verify": {
            const result = await forceVerifyEmailAction({
              targetUserId,
              confirmToken: token,
            });
            handleResult(result, `Email verified for ${targetEmail}.`);
            return;
          }
          case "revoke": {
            const result = await revokeAllSessionsAction({
              targetUserId,
              confirmToken: token,
            });
            handleResult(result, `Sessions revoked for ${targetEmail}.`);
            return;
          }
          case "suspend": {
            const result = await suspendUserAction({
              targetUserId,
              reason: queued.reason || undefined,
              confirmToken: token,
            });
            handleResult(result, `Suspended ${targetEmail}.`);
            return;
          }
          case "unsuspend": {
            const result = await unsuspendUserAction({
              targetUserId,
              confirmToken: token,
            });
            handleResult(result, `Reinstated ${targetEmail}.`);
            return;
          }
          case "promote": {
            const result = await promoteToAdminAction({
              targetUserId,
              confirmToken: token,
            });
            handleResult(result, `Promoted ${targetEmail} to admin.`);
            return;
          }
          case "demote": {
            const result = await demoteFromAdminAction({
              targetUserId,
              confirmToken: token,
            });
            handleResult(result, `Removed admin access from ${targetEmail}.`);
            return;
          }
          case "delete": {
            const result = await deleteUserAction({
              targetUserId,
              confirmToken: token,
            });
            handleResult(result, `Deleted ${targetEmail}.`);
            if (result.ok) {
              router.replace(ADMIN_USERS_PATH);
            }
            return;
          }
        }
      });
    },
    [handleResult, pendingConfirm, router, targetEmail, targetUserId],
  );

  const askConfirm = useCallback((next: PendingConfirm) => {
    setInputModal(null);
    setPendingConfirm(next);
  }, []);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarButton
          disabled={isPending || targetEmailVerified}
          disabledReason={
            targetEmailVerified ? "Email is already verified." : undefined
          }
          icon={CheckCircle2}
          isPending={isPending}
          label="Verify email"
          onClick={() =>
            askConfirm({
              kind: "verify",
              label: "Verify email",
              description: `Mark ${targetEmail} as verified.`,
              confirmLabel: "Verify email",
            })
          }
          selfBlocked={isSelf}
          variant="outline"
        />

        <ToolbarButton
          disabled={isPending}
          icon={LogOut}
          isPending={isPending}
          label="Revoke sessions"
          onClick={() =>
            askConfirm({
              kind: "revoke",
              label: "Revoke all sessions",
              description: `Sign ${targetEmail} out of every active session.`,
              confirmLabel: "Revoke sessions",
            })
          }
          selfBlocked={isSelf}
          variant="outline"
        />

        {targetIsSuspended ? (
          <ToolbarButton
            disabled={isPending}
            icon={UserRoundCheck}
            isPending={isPending}
            label="Reinstate"
            onClick={() =>
              askConfirm({
                kind: "unsuspend",
                label: "Reinstate user",
                description: `Restore sign-in for ${targetEmail}.`,
                confirmLabel: "Reinstate",
              })
            }
            selfBlocked={false}
            variant="outline"
          />
        ) : (
          <ToolbarButton
            disabled={isPending}
            icon={OctagonMinus}
            isPending={isPending}
            label="Suspend"
            onClick={() => setInputModal("suspend")}
            selfBlocked={isSelf}
            variant="outline"
          />
        )}

        {targetIsAdmin ? (
          <ToolbarButton
            disabled={isPending || !canDemoteTarget}
            disabledReason={
              canDemoteTarget ? undefined : "This is the last remaining admin."
            }
            icon={ShieldX}
            isPending={isPending}
            label="Remove admin"
            onClick={() =>
              askConfirm({
                kind: "demote",
                label: "Remove admin access",
                description: `Revoke admin console access for ${targetEmail}. They keep their normal Requo account.`,
                confirmLabel: "Remove admin",
              })
            }
            selfBlocked={isSelf}
            variant="outline"
          />
        ) : (
          <ToolbarButton
            disabled={isPending}
            icon={ShieldCheck}
            isPending={isPending}
            label="Promote to admin"
            onClick={() =>
              askConfirm({
                kind: "promote",
                label: "Promote to admin",
                description: `Grant ${targetEmail} access to the admin console.`,
                confirmLabel: "Promote to admin",
              })
            }
            selfBlocked={false}
            variant="outline"
          />
        )}

        <ToolbarButton
          disabled={isPending}
          icon={UserCog}
          isPending={isPending}
          label="Impersonate"
          onClick={() =>
            askConfirm({
              kind: "impersonate",
              label: "Start impersonation",
              description: `Sign in as ${targetEmail}. The impersonation banner stays visible until you stop.`,
              confirmLabel: "Start impersonation",
            })
          }
          selfBlocked={isSelf}
          variant="outline"
        />

        <ToolbarButton
          disabled={isPending}
          icon={Trash2}
          isPending={isPending}
          label="Delete"
          onClick={() =>
            askConfirm({
              kind: "delete",
              label: "Delete user",
              description: `Permanently delete ${targetEmail}. Data cascades per the existing schema.`,
              confirmLabel: "Delete user",
            })
          }
          selfBlocked={isSelf}
          variant="destructive"
        />
      </div>

      {/* Hidden form used by the impersonation action so the redirect
          happens server-side. The dialog populates the token input
          before submitting. */}
      <form
        action={getAdminStartImpersonationPath(targetUserId)}
        className="hidden"
        method="POST"
        ref={impersonateFormRef}
      >
        <input
          name="confirmToken"
          ref={impersonateTokenInputRef}
          type="hidden"
        />
      </form>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setInputModal(null);
          }
        }}
        open={inputModal !== null}
      >
        <DialogContent className="sm:max-w-md">
          {inputModal === "suspend" ? (
            <>
              <DialogHeader>
                <DialogTitle>Suspend user</DialogTitle>
                <DialogDescription>
                  Block {targetEmail} from signing in and drop their live
                  sessions.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="admin-suspend-reason">
                      Reason{" "}
                      <span className="font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="admin-suspend-reason"
                        maxLength={500}
                        onChange={(event) =>
                          setSuspendReason(event.target.value)
                        }
                        placeholder="Why is support suspending this account?"
                        rows={2}
                        value={suspendReason}
                      />
                      <FieldDescription>
                        Shown to the user and recorded on the audit row.
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
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    askConfirm({
                      kind: "suspend",
                      label: "Suspend user",
                      description: `Block ${targetEmail} from signing in.`,
                      confirmLabel: "Suspend",
                      reason: suspendReason.trim() || undefined,
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
    </TooltipProvider>
  );
}

type ToolbarButtonProps = {
  disabled: boolean;
  disabledReason?: string;
  icon: LucideIcon;
  isPending?: boolean;
  label: string;
  onClick: () => void;
  selfBlocked: boolean;
  variant: React.ComponentProps<typeof Button>["variant"];
};

/**
 * Toolbar button that handles the self-target lockout with an
 * accessible tooltip. Self-blocked buttons render disabled but
 * discoverable — visible but inoperative keeps the surface
 * discoverable.
 */
function ToolbarButton({
  disabled,
  disabledReason,
  icon: Icon,
  isPending = false,
  label,
  onClick,
  selfBlocked,
  variant,
}: ToolbarButtonProps) {
  const selfReason = "You can't run this action on your own account.";
  const reason = selfBlocked ? selfReason : disabledReason;
  const isDisabled = disabled || selfBlocked;
  const showSpinner = isPending && !selfBlocked && !disabledReason;

  const button = (
    <Button
      disabled={isDisabled}
      onClick={onClick}
      type="button"
      variant={variant}
    >
      {showSpinner ? (
        <Spinner data-icon="inline-start" aria-hidden="true" />
      ) : (
        <Icon data-icon="inline-start" aria-hidden="true" />
      )}
      {label}
    </Button>
  );

  if (!reason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Wrap in a span so the tooltip still fires while the button
            is disabled — disabled buttons don't emit pointer events. */}
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
