"use client";

import { useActionState, useEffect } from "react";
import { ClipboardCheck } from "lucide-react";

import {
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import type { InquiryIntakeCompletionActionState } from "@/features/inquiries/types";

type IntakeGap = {
  fieldId: string;
  label: string;
  reason: "missing" | "empty";
};

type IntakeCompletionAction = (
  state: InquiryIntakeCompletionActionState,
  formData: FormData,
) => Promise<InquiryIntakeCompletionActionState>;

/**
 * Collects critical intake answers that an older inquiry never captured.
 *
 * This is deliberately a separate owner action: it merges validated values
 * into the submitted snapshot and never bypasses the send gate, which still
 * re-evaluates readiness from the stored answers.
 */
export function InquiryIntakeCompletion({
  action,
  gaps,
}: {
  action: IntakeCompletionAction;
  gaps: IntakeGap[];
}) {
  const [state, formAction, isPending] = useActionState(
    action,
    {} as InquiryIntakeCompletionActionState,
  );
  const { scheduleRefresh } = useDeferredRefresh();

  useEffect(() => {
    if (state.success) {
      scheduleRefresh();
    }
  }, [scheduleRefresh, state.success]);

  if (!gaps.length) {
    return null;
  }

  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="This inquiry was submitted before these questions were required. Add the missing answers so quote sending can pass its checks."
      title="Complete required intake details"
    >
      <form action={formAction} className="flex flex-col gap-4">
        <input
          name="fieldIds"
          type="hidden"
          value={JSON.stringify(gaps.map((gap) => gap.fieldId))}
        />

        {state.error ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t save the details</AlertTitle>
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        {state.success ? (
          <Alert>
            <AlertTitle>Required details saved</AlertTitle>
            <AlertDescription>{state.success}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {gaps.map((gap) => (
            <div className="min-w-0" key={gap.fieldId}>
              <label
                className="meta-label mb-1.5 block"
                htmlFor={`intake-${gap.fieldId}`}
              >
                {gap.label}
              </label>
              <Input
                id={`intake-${gap.fieldId}`}
                name={gap.fieldId}
                placeholder={
                  gap.reason === "empty"
                    ? "Add the missing answer"
                    : "Enter this detail"
                }
                required
              />
            </div>
          ))}
        </div>

        <div>
          <Button disabled={isPending} type="submit">
            {isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <ClipboardCheck data-icon="inline-start" />
            )}
            {isPending ? "Saving..." : "Save required details"}
          </Button>
        </div>
      </form>
    </DashboardSection>
  );
}
