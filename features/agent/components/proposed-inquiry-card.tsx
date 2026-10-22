"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createInquiryParamsSchema } from "@/features/agent/schemas";
import type { ProposedInquiry } from "@/features/agent/types";
import { inquiryContactMethods } from "@/features/inquiries/form-config";

export type ProposalValues = {
  customerName: string;
  customerEmail?: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  serviceSlug: string;
  details: string;
  budgetText?: string;
  requestedDeadline?: string;
};

function toEditableValues(proposal: ProposedInquiry): ProposalValues {
  return {
    customerName: proposal.values.customerName ?? "",
    customerEmail: proposal.values.customerEmail ?? "",
    customerContactMethod: proposal.values.customerContactMethod ?? "email",
    customerContactHandle: proposal.values.customerContactHandle ?? "",
    serviceSlug:
      proposal.values.serviceSlug ??
      (proposal.values as { serviceCategory?: string }).serviceCategory ??
      "",
    details: proposal.values.details ?? "",
    budgetText: proposal.values.budgetText ?? "",
    requestedDeadline: proposal.values.requestedDeadline ?? "",
  };
}

function fieldError(
  errors: Record<string, string>,
  name: string,
): string | undefined {
  return errors[name];
}

/**
 * The Proposed Inquiry card: what the Agent is about to send, already filled
 * in, every field editable from first paint. One obvious primary sends the
 * Inquiry; a quiet secondary discards. After sending it becomes the receipt.
 */
export function ProposedInquiryCard({
  proposal,
  values,
  onValuesChange,
  onApprove,
  onDiscard,
  approving,
  discarding,
  serverError,
}: {
  proposal: ProposedInquiry;
  values: ProposalValues;
  onValuesChange: (next: ProposalValues) => void;
  onApprove: () => void;
  onDiscard: () => void;
  approving: boolean;
  discarding: boolean;
  serverError: string | null;
}) {
  const [touched, setTouched] = useState(false);
  const submitted = proposal.status === "approved";
  const busy = approving || discarding;

  const validation = useMemo(() => {
    const parsed = createInquiryParamsSchema.safeParse({
      customerName: values.customerName,
      customerEmail:
        values.customerEmail && values.customerEmail.trim()
          ? values.customerEmail.trim()
          : undefined,
      customerContactMethod: values.customerContactMethod,
      customerContactHandle: values.customerContactHandle,
      serviceSlug: values.serviceSlug,
      details: values.details,
      budgetText:
        values.budgetText && values.budgetText.trim()
          ? values.budgetText.trim()
          : undefined,
      requestedDeadline:
        values.requestedDeadline && values.requestedDeadline.trim()
          ? values.requestedDeadline.trim()
          : undefined,
    });
    if (parsed.success) return { ok: true as const, errors: {} };
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false as const, errors };
  }, [values]);

  const showErrors = touched && !validation.ok;

  const set = (patch: Partial<ProposalValues>) => {
    onValuesChange({ ...values, ...patch });
  };

  const handleApprove = () => {
    setTouched(true);
    if (!validation.ok) return;
    onApprove();
  };

  if (submitted) {
    return (
      <Card
        aria-label="Sent inquiry receipt"
        className="w-full"
        data-proposal-state="submitted"
      >
        <CardHeader>
          <CardTitle className="text-base">Sent to the business</CardTitle>
          <p className="text-sm text-muted-foreground">
            This is what the business received.
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="meta-label">Name</dt>
              <dd className="mt-0.5 text-foreground">{values.customerName}</dd>
            </div>
            <div>
              <dt className="meta-label">Contact</dt>
              <dd className="mt-0.5 text-foreground">
                {values.customerContactMethod} · {values.customerContactHandle}
              </dd>
            </div>
            {values.customerEmail ? (
              <div>
                <dt className="meta-label">Email</dt>
                <dd className="mt-0.5 text-foreground">{values.customerEmail}</dd>
              </div>
            ) : null}
            <div>
              <dt className="meta-label">Service</dt>
              <dd className="mt-0.5 text-foreground">{values.serviceSlug}</dd>
            </div>
            <div>
              <dt className="meta-label">Details</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-foreground">
                {values.details}
              </dd>
            </div>
            {values.budgetText ? (
              <div>
                <dt className="meta-label">Budget</dt>
                <dd className="mt-0.5 text-foreground">{values.budgetText}</dd>
              </div>
            ) : null}
            {values.requestedDeadline ? (
              <div>
                <dt className="meta-label">Deadline</dt>
                <dd className="mt-0.5 text-foreground">
                  {values.requestedDeadline}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      aria-label="Review your inquiry before sending"
      className="w-full"
      data-proposal-state="pending"
    >
      <CardHeader>
        <CardTitle className="text-base">Review before sending</CardTitle>
        <p className="text-sm text-muted-foreground">
          This is exactly what the business will receive. Fix anything below,
          or just keep chatting — “the budget is closer to 2,000” updates this
          same card.
        </p>
      </CardHeader>
      <CardContent>
        <form
          aria-label="Review your inquiry before sending"
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            handleApprove();
          }}
        >
          <Field data-invalid={Boolean(fieldError(validation.errors, "customerName") && showErrors)}>
            <FieldLabel htmlFor="proposal-customerName">Your name</FieldLabel>
            <FieldContent>
              <Input
                aria-invalid={Boolean(showErrors && fieldError(validation.errors, "customerName"))}
                disabled={busy}
                id="proposal-customerName"
                onChange={(event) => set({ customerName: event.target.value })}
                value={values.customerName}
              />
            </FieldContent>
            {showErrors && fieldError(validation.errors, "customerName") ? (
              <p className="text-sm text-destructive">{fieldError(validation.errors, "customerName")}</p>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(showErrors && fieldError(validation.errors, "customerEmail"))}>
            <FieldLabel htmlFor="proposal-customerEmail">
              Email <span className="font-normal text-muted-foreground">(optional)</span>
            </FieldLabel>
            <FieldContent>
              <Input
                aria-invalid={Boolean(showErrors && fieldError(validation.errors, "customerEmail"))}
                autoComplete="email"
                disabled={busy}
                id="proposal-customerEmail"
                inputMode="email"
                onChange={(event) => set({ customerEmail: event.target.value })}
                value={values.customerEmail ?? ""}
              />
            </FieldContent>
            {showErrors && fieldError(validation.errors, "customerEmail") ? (
              <p className="text-sm text-destructive">{fieldError(validation.errors, "customerEmail")}</p>
            ) : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(showErrors && fieldError(validation.errors, "customerContactMethod"))}>
              <FieldLabel htmlFor="proposal-contactMethod">Contact method</FieldLabel>
              <FieldContent>
                <SelectRoot
                  disabled={busy}
                  onValueChange={(value: string) => set({ customerContactMethod: value })}
                  value={values.customerContactMethod}
                >
                  <SelectTrigger id="proposal-contactMethod" className="w-full">
                    <SelectValue placeholder="Choose how to reach you" />
                  </SelectTrigger>
                  <SelectContent>
                    {inquiryContactMethods.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method.charAt(0).toUpperCase() + method.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              </FieldContent>
              {showErrors && fieldError(validation.errors, "customerContactMethod") ? (
                <p className="text-sm text-destructive">{fieldError(validation.errors, "customerContactMethod")}</p>
              ) : null}
            </Field>

            <Field data-invalid={Boolean(showErrors && fieldError(validation.errors, "customerContactHandle"))}>
              <FieldLabel htmlFor="proposal-contactHandle">Contact details</FieldLabel>
              <FieldContent>
                <Input
                  aria-invalid={Boolean(showErrors && fieldError(validation.errors, "customerContactHandle"))}
                  disabled={busy}
                  id="proposal-contactHandle"
                  onChange={(event) =>
                    set({ customerContactHandle: event.target.value })
                  }
                  value={values.customerContactHandle}
                />
              </FieldContent>
              {showErrors && fieldError(validation.errors, "customerContactHandle") ? (
                <p className="text-sm text-destructive">{fieldError(validation.errors, "customerContactHandle")}</p>
              ) : null}
            </Field>
          </div>

          <Field data-invalid={Boolean(showErrors && fieldError(validation.errors, "serviceSlug"))}>
            <FieldLabel htmlFor="proposal-serviceSlug">Service</FieldLabel>
            <FieldContent>
              <Input
                aria-invalid={Boolean(showErrors && fieldError(validation.errors, "serviceSlug"))}
                disabled={busy}
                id="proposal-serviceSlug"
                onChange={(event) => set({ serviceSlug: event.target.value })}
                value={values.serviceSlug}
              />
            </FieldContent>
            {showErrors && fieldError(validation.errors, "serviceSlug") ? (
              <p className="text-sm text-destructive">{fieldError(validation.errors, "serviceSlug")}</p>
            ) : null}
          </Field>

          <Field data-invalid={Boolean(showErrors && fieldError(validation.errors, "details"))}>
            <FieldLabel htmlFor="proposal-details">Project details</FieldLabel>
            <FieldContent>
              <Textarea
                aria-invalid={Boolean(showErrors && fieldError(validation.errors, "details"))}
                disabled={busy}
                id="proposal-details"
                onChange={(event) => set({ details: event.target.value })}
                rows={4}
                value={values.details}
              />
            </FieldContent>
            {showErrors && fieldError(validation.errors, "details") ? (
              <p className="text-sm text-destructive">{fieldError(validation.errors, "details")}</p>
            ) : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(showErrors && fieldError(validation.errors, "budgetText"))}>
              <FieldLabel htmlFor="proposal-budget">
                Budget <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <FieldContent>
                <Input
                  aria-invalid={Boolean(showErrors && fieldError(validation.errors, "budgetText"))}
                  disabled={busy}
                  id="proposal-budget"
                  onChange={(event) => set({ budgetText: event.target.value })}
                  value={values.budgetText ?? ""}
                />
              </FieldContent>
              {showErrors && fieldError(validation.errors, "budgetText") ? (
                <p className="text-sm text-destructive">{fieldError(validation.errors, "budgetText")}</p>
              ) : null}
            </Field>

            <Field data-invalid={Boolean(showErrors && fieldError(validation.errors, "requestedDeadline"))}>
              <FieldLabel htmlFor="proposal-deadline">
                Deadline <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <FieldContent>
                <Input
                  aria-invalid={Boolean(showErrors && fieldError(validation.errors, "requestedDeadline"))}
                  disabled={busy}
                  id="proposal-deadline"
                  onChange={(event) =>
                    set({ requestedDeadline: event.target.value })
                  }
                  value={values.requestedDeadline ?? ""}
                />
              </FieldContent>
              {showErrors && fieldError(validation.errors, "requestedDeadline") ? (
                <p className="text-sm text-destructive">{fieldError(validation.errors, "requestedDeadline")}</p>
              ) : null}
            </Field>
          </div>

          {serverError ? (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button disabled={busy} type="submit">
              {approving ? "Sending…" : "Send"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void onDiscard()}
              type="button"
              variant="ghost"
            >
              {discarding ? "Discarding…" : "Discard"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export { toEditableValues };
