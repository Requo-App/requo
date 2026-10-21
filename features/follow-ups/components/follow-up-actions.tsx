"use client";

import { useState } from "react";
import { AlarmClock, CalendarClock, CheckCircle2, SkipForward } from "lucide-react";

import { OptimisticPendingIndicator } from "@/components/shared/optimistic-pending-indicator";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import {
  ResponsiveOverlay,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
  ResponsiveOverlayTrigger,
} from "@/components/ui/responsive-overlay";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useDeferredActionState } from "@/hooks/use-deferred-action-state";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import type {
  FollowUpCompleteActionState,
  FollowUpRecordActionState,
  FollowUpRescheduleActionState,
  FollowUpSnoozeActionState,
} from "@/features/follow-ups/types";
import { getDateInputValue, getQuickFollowUpDueDate } from "@/features/follow-ups/utils";

type CompleteAction = (
  state: FollowUpCompleteActionState,
  formData: FormData,
) => Promise<FollowUpCompleteActionState>;

type RecordAction = (
  state: FollowUpRecordActionState,
  formData: FormData,
) => Promise<FollowUpRecordActionState>;

type RescheduleAction = (
  state: FollowUpRescheduleActionState,
  formData: FormData,
) => Promise<FollowUpRescheduleActionState>;

type SnoozeAction = (
  state: FollowUpSnoozeActionState,
  formData: FormData,
) => Promise<FollowUpSnoozeActionState>;

export function FollowUpActions({
  completeAction,
  skipAction,
  rescheduleAction,
  snoozeAction,
  dueAt,
  disabled = false,
  onOptimisticDismiss,
  timezone,
}: {
  completeAction: CompleteAction;
  skipAction: RecordAction;
  rescheduleAction: RescheduleAction;
  snoozeAction?: SnoozeAction;
  dueAt: Date;
  disabled?: boolean;
  onOptimisticDismiss?: () => void;
  /** Business timezone — due dates are read and entered in it. */
  timezone?: string;
}) {
  return (
    <div className="dashboard-actions [&>*]:w-full sm:[&>*]:w-auto">
      <FollowUpCompleteDialog
        action={completeAction}
        disabled={disabled}
        onOptimisticDismiss={onOptimisticDismiss}
      />
      <FollowUpRescheduleDialog
        action={rescheduleAction}
        disabled={disabled}
        dueAt={dueAt}
        timezone={timezone}
      />
      {snoozeAction ? (
        <FollowUpSnoozeDialog
          action={snoozeAction}
          disabled={disabled}
          timezone={timezone}
        />
      ) : null}
      <FollowUpSkipButton
        action={skipAction}
        disabled={disabled}
        onOptimisticDismiss={onOptimisticDismiss}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Complete with optional note
// ---------------------------------------------------------------------------

function FollowUpCompleteDialog({
  action,
  disabled,
  onOptimisticDismiss,
}: {
  action: CompleteAction;
  disabled: boolean;
  onOptimisticDismiss?: () => void;
}) {
  const { refreshNow } = useDeferredRefresh();
  const [open, setOpen] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [_state, formAction, isPending] = useDeferredActionState(
    action,
    {} as FollowUpCompleteActionState,
    {
      onOptimistic: onOptimisticDismiss,
      onRevert: refreshNow,
      onSuccess: () => {
        setOpen(false);
        setCompletionNote("");
      },
    },
  );

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setCompletionNote("");
        setOpen(nextOpen);
      }}
    >
      <ResponsiveOverlayTrigger asChild>
        <Button disabled={disabled} type="button" variant="default">
          <CheckCircle2 data-icon="inline-start" />
          Done
        </Button>
      </ResponsiveOverlayTrigger>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Mark follow-up as done</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Note what happened with the customer (e.g. &ldquo;sent message&rdquo;, &ldquo;left voicemail&rdquo;, &ldquo;customer replied&rdquo;).
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <form action={formAction}>
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <Field>
              <FieldLabel htmlFor="follow-up-completion-note">
                What happened?
              </FieldLabel>
              <FieldDescription>Optional — leave blank to just mark it done.</FieldDescription>
              <FieldContent>
                <Textarea
                  id="follow-up-completion-note"
                  maxLength={500}
                  name="completionNote"
                  onChange={(event) => setCompletionNote(event.currentTarget.value)}
                  placeholder="Left voicemail, will try again Thursday..."
                  rows={2}
                  value={completionNote}
                />
              </FieldContent>
            </Field>
          </div>
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button disabled={isPending} type="button" variant="ghost">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button disabled={isPending} type="submit">
              <OptimisticPendingIndicator pending={isPending} />
              <CheckCircle2 data-icon="inline-start" />
              Mark done
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

// ---------------------------------------------------------------------------
// Skip button (simple, no dialog)
// ---------------------------------------------------------------------------

function FollowUpSkipButton({
  action,
  disabled,
  onOptimisticDismiss,
}: {
  action: RecordAction;
  disabled: boolean;
  onOptimisticDismiss?: () => void;
}) {
  const { refreshNow } = useDeferredRefresh();
  const [, formAction, isPending] = useDeferredActionState(
    action,
    {} as FollowUpRecordActionState,
    {
      onOptimistic: onOptimisticDismiss,
      onRevert: refreshNow,
    },
  );

  return (
    <form action={formAction}>
      <Button disabled={disabled || isPending} type="submit" variant="ghost">
        <OptimisticPendingIndicator pending={isPending} />
        <SkipForward data-icon="inline-start" />
        Dismiss
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Reschedule dialog
// ---------------------------------------------------------------------------

function FollowUpRescheduleDialog({
  action,
  disabled,
  dueAt,
  timezone,
}: {
  action: RescheduleAction;
  disabled: boolean;
  dueAt: Date;
  timezone?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState(getDateInputValue(dueAt, timezone));
  const [state, formAction, isPending] = useDeferredActionState(
    action,
    {} as FollowUpRescheduleActionState,
    {
      onSuccess: () => {
        setOpen(false);
      },
    },
  );

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDueDate(getDateInputValue(dueAt, timezone));
        }

        setOpen(nextOpen);
      }}
    >
      <ResponsiveOverlayTrigger asChild>
        <Button disabled={disabled} type="button" variant="outline">
          <CalendarClock data-icon="inline-start" />
          Reschedule
        </Button>
      </ResponsiveOverlayTrigger>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Reschedule follow-up</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Pick the next date you want this reminder to show up.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <form action={formAction}>
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <Field data-invalid={Boolean(state.fieldErrors?.dueDate?.[0])}>
              <FieldLabel htmlFor="follow-up-reschedule-date">Due date</FieldLabel>
              <FieldContent>
                <DatePicker
                  ariaInvalid={Boolean(state.fieldErrors?.dueDate?.[0])}
                  id="follow-up-reschedule-date"
                  name="dueDate"
                  onChange={setDueDate}
                  required
                  value={dueDate}
                />
              </FieldContent>
            </Field>
          </div>
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button disabled={isPending} type="button" variant="ghost">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button disabled={isPending} type="submit">
              <OptimisticPendingIndicator pending={isPending} />
              Reschedule
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

// ---------------------------------------------------------------------------
// Snooze dialog
// ---------------------------------------------------------------------------

function FollowUpSnoozeDialog({
  action,
  disabled,
  timezone,
}: {
  action: SnoozeAction;
  disabled: boolean;
  timezone?: string;
}) {
  const [open, setOpen] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState(
    getQuickFollowUpDueDate("tomorrow", new Date(), timezone),
  );
  const [snoozeTime, setSnoozeTime] = useState("09:00");
  const [state, formAction, isPending] = useDeferredActionState(
    action,
    {} as FollowUpSnoozeActionState,
    {
      onSuccess: () => {
        setOpen(false);
      },
    },
  );

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setSnoozeDate(getQuickFollowUpDueDate("tomorrow", new Date(), timezone));
          setSnoozeTime("09:00");
        }
        setOpen(nextOpen);
      }}
    >
      <ResponsiveOverlayTrigger asChild>
        <Button disabled={disabled} type="button" variant="outline">
          <AlarmClock data-icon="inline-start" />
          Snooze
        </Button>
      </ResponsiveOverlayTrigger>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Snooze follow-up</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Suppress reminders until this time without changing the due date.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <form action={formAction}>
          <input
            name="snoozedUntil"
            type="hidden"
            value={`${snoozeDate}T${snoozeTime}:00`}
          />
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(state.fieldErrors?.snoozedUntil?.[0])}>
                <FieldLabel htmlFor="follow-up-snooze-date">Date</FieldLabel>
                <FieldContent>
                  <DatePicker
                    ariaInvalid={Boolean(state.fieldErrors?.snoozedUntil?.[0])}
                    id="follow-up-snooze-date"
                    onChange={setSnoozeDate}
                    required
                    value={snoozeDate}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="follow-up-snooze-time">Time</FieldLabel>
                <FieldContent>
                  <Input
                    id="follow-up-snooze-time"
                    onChange={(event) => setSnoozeTime(event.currentTarget.value)}
                    required
                    type="time"
                    value={snoozeTime}
                  />
                </FieldContent>
              </Field>
            </div>
          </div>
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button disabled={isPending} type="button" variant="ghost">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button disabled={isPending} type="submit">
              <OptimisticPendingIndicator pending={isPending} />
              <AlarmClock data-icon="inline-start" />
              Snooze
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
