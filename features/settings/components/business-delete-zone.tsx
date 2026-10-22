"use client";

import { useState } from "react";
import { Archive, RotateCcw, Trash2 } from "lucide-react";

import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayFooter,
} from "@/components/ui/responsive-overlay";
import { ConfirmationHeader } from "@/components/shared/confirmation-dialog";
import {
  ServerActionButton,
  ServerActionConfirmDialog,
} from "@/components/shared/server-action-button";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import type { BusinessRecordState } from "@/features/businesses/lifecycle";
import type { BusinessRecordActionState } from "@/features/businesses/types";

type BusinessDeleteZoneProps = {
  archiveAction: (
    state: BusinessRecordActionState,
    formData: FormData,
  ) => Promise<BusinessRecordActionState>;
  businessName: string;
  deleteAction: (
    state: BusinessRecordActionState,
    formData: FormData,
  ) => Promise<BusinessRecordActionState>;
  recordState: BusinessRecordState;
  restoreAction: (
    state: BusinessRecordActionState,
    formData: FormData,
  ) => Promise<BusinessRecordActionState>;
  unarchiveAction: (
    state: BusinessRecordActionState,
    formData: FormData,
  ) => Promise<BusinessRecordActionState>;
};

const initialState: BusinessRecordActionState = {};

export function BusinessDeleteZone({
  archiveAction,
  businessName,
  deleteAction,
  recordState,
  restoreAction,
  unarchiveAction,
}: BusinessDeleteZoneProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteState, deleteFormAction, isDeletePending] =
    useActionStateWithSonner(deleteAction, initialState);
  const confirmationMatches =
    confirmation.trim().toLowerCase() === businessName.trim().toLowerCase();

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Danger zone
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Archive this business or delete your whole business.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {recordState === "archived" ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Restore this business
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Make this business active and editable again.
              </p>
              <div className="mt-2">
                <ServerActionButton
                  action={unarchiveAction}
                  icon={RotateCcw}
                  label="Restore"
                  pendingLabel="Restoring..."
                />
              </div>
            </div>
          ) : recordState === "trash" ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Restore this business
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Bring this business back from trash.
              </p>
              <div className="mt-2">
                <ServerActionButton
                  action={restoreAction}
                  icon={RotateCcw}
                  label="Restore"
                  pendingLabel="Restoring..."
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Archive this business
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Make it read-only and hide it from active views. You can
                restore it later.
              </p>
              <div className="mt-2">
                <ServerActionConfirmDialog
                  action={archiveAction}
                  confirmLabel="Archive"
                  confirmPendingLabel="Archiving..."
                  confirmVariant="default"
                  description="Archived businesses are read-only and hidden from active views. You can restore it later."
                  icon={Archive}
                  title="Archive this business?"
                  triggerLabel="Archive"
                  triggerVariant="outline"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-foreground">
              Delete this business
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              Permanently remove all data including inquiries, quotes, and
              forms. This cannot be undone.
            </p>
            <div className="mt-2">
              <Button
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                type="button"
                variant="outline"
                onClick={() => setOpen(true)}
              >
                <Trash2 data-icon="inline-start" aria-hidden="true" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </section>

      <ResponsiveOverlay open={open} onOpenChange={setOpen}>
        <ResponsiveOverlayContent className="sm:max-w-lg">
          <ConfirmationHeader
            tone="destructive"
            icon={Trash2}
            title="Delete business permanently?"
            description={
              <>
                This permanently removes {businessName}, all its inquiries,
                quotes, forms, and follow-ups. This action cannot be undone.
              </>
            }
          />
          <form action={deleteFormAction}>
            <ResponsiveOverlayBody>
              <FieldGroup>
                <Field
                  data-invalid={
                    Boolean(deleteState.fieldErrors?.confirmation) || undefined
                  }
                >
                  <FieldLabel htmlFor="business-delete-confirmation">
                    Type the business name to confirm
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      autoComplete="off"
                      disabled={isDeletePending}
                      id="business-delete-confirmation"
                      name="confirmation"
                      onChange={(event) => setConfirmation(event.target.value)}
                      placeholder={businessName}
                      value={confirmation}
                    />
                    <FieldDescription>
                      Enter <strong>{businessName}</strong> to confirm.
                    </FieldDescription>
                    <FieldError
                      errors={
                        deleteState.fieldErrors?.confirmation?.[0]
                          ? [
                              {
                                message:
                                  deleteState.fieldErrors.confirmation[0],
                              },
                            ]
                          : undefined
                      }
                    />
                  </FieldContent>
                </Field>
              </FieldGroup>
            </ResponsiveOverlayBody>
            <ResponsiveOverlayFooter>
              <ResponsiveOverlayClose asChild>
                <Button disabled={isDeletePending} type="button" variant="outline">
                  Cancel
                </Button>
              </ResponsiveOverlayClose>
              <Button
                disabled={isDeletePending || !confirmationMatches}
                type="submit"
                variant="destructive"
              >
                {isDeletePending ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden="true" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 data-icon="inline-start" aria-hidden="true" />
                    Delete
                  </>
                )}
              </Button>
            </ResponsiveOverlayFooter>
          </form>
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>
    </>
  );
}
