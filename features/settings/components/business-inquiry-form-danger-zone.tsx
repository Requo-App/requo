"use client";

import { Archive, Trash2 } from "lucide-react";

import { ServerActionConfirmDialog } from "@/components/shared/server-action-button";
import type { BusinessInquiryFormDangerActionState } from "@/features/settings/types";

type BusinessInquiryFormDangerZoneProps = {
  activeFormCount?: number;
  archiveAction: (
    state: BusinessInquiryFormDangerActionState,
    formData: FormData,
  ) => Promise<BusinessInquiryFormDangerActionState>;
  deleteAction: (
    state: BusinessInquiryFormDangerActionState,
    formData: FormData,
  ) => Promise<BusinessInquiryFormDangerActionState>;
  formId: string;
  inquiryListHref: string;
  isDefault?: boolean;
  submittedInquiryCount?: number;
};

export function BusinessInquiryFormDangerZone({
  activeFormCount,
  archiveAction,
  deleteAction,
  formId,
  inquiryListHref,
  isDefault,
  submittedInquiryCount,
}: BusinessInquiryFormDangerZoneProps) {
  // Mirror the server rules so the owner sees why a control is unavailable
  // instead of hitting an error toast after the fact.
  const isOnlyActiveService = (activeFormCount ?? 0) <= 1;
  const archiveBlockedReason = isDefault
    ? "Set another service as default before archiving this one."
    : isOnlyActiveService
      ? "Keep at least one active service."
      : null;
  const deleteBlockedReason = isOnlyActiveService
    ? "Create another service before deleting this one."
    : (submittedInquiryCount ?? 0) > 0
      ? "This service still has inquiries. Archive it instead."
      : null;

  return (
    <section className="rounded-xl border border-destructive/25 bg-card/97 shadow-xs">
      <div className="border-b border-border/70 p-4 sm:p-5">
        <h3 className="font-heading text-sm font-semibold tracking-tight text-foreground sm:text-base">
          Danger zone
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
          Archive or permanently delete this service.
        </p>
      </div>

      <div className="divide-y divide-border/60">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Archive service</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Hide this service without deleting previously submitted customer
              inquiries.
            </p>
            {archiveBlockedReason ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {archiveBlockedReason}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 self-start sm:self-center">
            <ServerActionConfirmDialog
              action={archiveAction}
              confirmLabel="Archive service"
              confirmPendingLabel="Archiving..."
              confirmVariant="default"
              description="Archived services are hidden from active views but keep all submitted inquiries. You can restore the service later."
              disabled={Boolean(archiveBlockedReason)}
              formValues={{ targetFormId: formId }}
              icon={Archive}
              redirectHref={inquiryListHref}
              title="Archive this service?"
              triggerLabel="Archive service"
              triggerVariant="outline"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">Delete service</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Permanently remove this service. Only available when no inquiries
              or page-view analytics are linked.
            </p>
            {deleteBlockedReason ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {deleteBlockedReason}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 self-start sm:self-center">
            <ServerActionConfirmDialog
              action={deleteAction}
              confirmLabel="Delete service"
              confirmPendingLabel="Deleting..."
              description="This will permanently delete the service. Services with linked inquiries must be archived instead."
              disabled={Boolean(deleteBlockedReason)}
              formValues={{ targetFormId: formId }}
              icon={Trash2}
              redirectHref={inquiryListHref}
              title="Delete this service?"
              triggerLabel="Delete service"
              triggerVariant="destructive"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
