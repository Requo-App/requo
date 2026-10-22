"use client";

import {
  DashboardMetaPill,
  DashboardStatsGrid,
} from "@/components/shared/dashboard-layout";
import { InfoTile } from "@/components/shared/info-tile";
import {
  getInquiryFormFieldInputName,
  inquiryContactMethodLabels,
  type InquiryContactMethod,
  type InquiryFormFieldDefinition,
  type InquiryFormSystemFieldDefinition,
} from "@/features/inquiries/form-config";
import type { InquiryEditorService } from "@/features/inquiries/types";
import type { ProjectValues } from "./types";
import { getPreviewValueDisplay } from "./utils";

export function ManualInquiryPreview({
  customerName,
  customerEmail,
  customerContactMethod,
  customerContactHandle,
  projectFields,
  projectValues,
  selectedFileName,
  selectedService,
}: {
  customerName: string;
  customerEmail: string;
  customerContactMethod: InquiryContactMethod;
  customerContactHandle: string;
  projectFields: InquiryFormFieldDefinition[];
  projectValues: ProjectValues;
  selectedFileName: string | null;
  selectedService: InquiryEditorService;
}) {
  const detailsField = projectFields.find(
    (field): field is InquiryFormSystemFieldDefinition =>
      field.kind === "system" && field.key === "details",
  );
  const requestedDeadlineField = projectFields.find(
    (field): field is InquiryFormSystemFieldDefinition =>
      field.kind === "system" && field.key === "requestedDeadline",
  );
  const budgetField = projectFields.find(
    (field): field is InquiryFormSystemFieldDefinition =>
      field.kind === "system" && field.key === "budgetText",
  );
  const additionalFields = projectFields.filter((field) => {
    if (field.kind === "system") {
      return !["requestedDeadline", "budgetText", "details"].includes(
        field.key,
      );
    }

    return true;
  });
  const details = detailsField
    ? getPreviewValueDisplay(detailsField, projectValues)
    : "Not provided";
  const requestedDeadline = requestedDeadlineField
    ? getPreviewValueDisplay(requestedDeadlineField, projectValues)
    : "Not provided";
  const budget = budgetField
    ? getPreviewValueDisplay(budgetField, projectValues)
    : "Not provided";

  return (
    <article data-padding="none" className="section-panel overflow-hidden p-5 sm:p-6 xl:sticky xl:top-[5.5rem] xl:self-start">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 border-b border-border/80 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <p className="meta-label">Inquiry preview</p>
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-foreground">
                {selectedService.name}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Saved with the {selectedService.name} form.
              </p>
            </div>
          </div>

          <div className="dashboard-detail-header-meta">
            <DashboardMetaPill>{selectedService.name}</DashboardMetaPill>
            <DashboardMetaPill>Manual entry</DashboardMetaPill>
          </div>
        </div>

        <DashboardStatsGrid className="xl:!grid-cols-2">
          <InfoTile
            label="Customer"
            value={customerName.trim() || "Customer name"}
          />
          <InfoTile
            label="Email"
            value={customerEmail.trim() || "Not provided"}
          />
          <InfoTile
            label="Preferred contact"
            value={
              customerContactHandle.trim() ||
              inquiryContactMethodLabels[customerContactMethod]
            }
          />
          <InfoTile
            label={requestedDeadlineField?.label ?? "Requested deadline"}
            value={requestedDeadline}
          />
          <InfoTile
            label={budgetField?.label ?? "Budget"}
            value={budget}
          />
        </DashboardStatsGrid>

          <div className="soft-panel shadow-none">
          <p className="meta-label">
            {detailsField?.label ?? "Inquiry details"}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-normal sm:leading-7 text-foreground">
            {details !== "Not provided"
              ? details
              : "Add the main scope, context, and anything needed before quoting or following up."}
          </p>
        </div>

        {additionalFields.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {additionalFields.map((field) => (
              <InfoTile
                key={getInquiryFormFieldInputName(field)}
                label={field.label}
                value={getPreviewValueDisplay(field, projectValues)}
                valueClassName="text-sm font-medium"
              />
            ))}
          </div>
        ) : null}

        {selectedFileName ? (
          <div className="soft-panel shadow-none">
            <p className="meta-label">Attachment</p>
            <p className="mt-3 text-sm font-medium text-foreground">
              {selectedFileName}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
