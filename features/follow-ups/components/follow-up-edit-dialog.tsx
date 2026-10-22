"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useDeferredActionState } from "@/hooks/use-deferred-action-state";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import type {
  FollowUpCategory,
  FollowUpChannel,
  FollowUpEditActionState,
  FollowUpRecurrence,
  FollowUpSendMode,
  FollowUpTerminationCondition,
  FollowUpView,
} from "@/features/follow-ups/types";
import { followUpChannels, followUpRecurrences, followUpSendModes, followUpTerminationConditions } from "@/features/follow-ups/types";
import {
  followUpChannelLabels,
  followUpRecurrenceLabels,
  followUpSendModeLabels,
  followUpTerminationConditionLabels,
  getDateInputValue,
} from "@/features/follow-ups/utils";

type FollowUpEditAction = (
  state: FollowUpEditActionState,
  formData: FormData,
) => Promise<FollowUpEditActionState>;

const channelOptions = followUpChannels.map((channel) => ({
  label: followUpChannelLabels[channel],
  value: channel,
}));

const sendModeOptions = followUpSendModes.map((sendMode) => ({
  label: followUpSendModeLabels[sendMode],
  value: sendMode,
}));

const recurrenceOptions = followUpRecurrences.map((r) => ({
  label: followUpRecurrenceLabels[r],
  value: r,
}));

const terminationConditionOptions = [
  { label: "No end condition", value: "none" },
  ...followUpTerminationConditions.map((tc) => ({
    label: followUpTerminationConditionLabels[tc],
    value: tc,
  })),
];

const categoryOptions = [
  { label: "Sales follow-up", value: "sales" },
  { label: "Post-win follow-up", value: "post_win" },
] as const;

export function FollowUpEditDialog({
  action,
  followUp,
  disabled = false,
}: {
  action: FollowUpEditAction;
  followUp: FollowUpView;
  disabled?: boolean;
}) {
  const canSendAutomatically = hasFeatureAccess(
    followUp.businessPlan,
    "autoFollowUps",
  );
  const availableSendModeOptions = sendModeOptions.filter(
    (option) => option.value !== "automatic" || canSendAutomatically,
  );
  const initialSendMode =
    followUp.sendMode === "automatic" && !canSendAutomatically
      ? "manual"
      : followUp.sendMode ?? "manual";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(followUp.title);
  const [reason, setReason] = useState(followUp.reason);
  const [channel, setChannel] = useState<FollowUpChannel>(followUp.channel);
  const [sendMode, setSendMode] = useState<FollowUpSendMode>(initialSendMode);
  const [category, setCategory] = useState<FollowUpCategory>(followUp.category);
  const [dueDate, setDueDate] = useState(
    getDateInputValue(followUp.dueAt, followUp.businessTimezone),
  );
  const [recurrence, setRecurrence] = useState<FollowUpRecurrence>(followUp.recurrence);
  const [recurrenceLimit, setRecurrenceLimit] = useState(
    followUp.recurrenceLimit?.toString() ?? "",
  );
  const [terminationCondition, setTerminationCondition] = useState<FollowUpTerminationCondition | "none">(
    followUp.terminationCondition ?? "none",
  );
  const hasLinkedItem = Boolean(followUp.inquiryId || followUp.quoteId);
  const [state, formAction, isPending] = useDeferredActionState(
    action,
    {} as FollowUpEditActionState,
    {
      onSuccess: () => setOpen(false),
    },
  );

  function resetFields() {
    setTitle(followUp.title);
    setReason(followUp.reason);
    setChannel(followUp.channel);
    setSendMode(initialSendMode);
    setCategory(followUp.category);
    setDueDate(getDateInputValue(followUp.dueAt, followUp.businessTimezone));
    setRecurrence(followUp.recurrence);
    setRecurrenceLimit(followUp.recurrenceLimit?.toString() ?? "");
    setTerminationCondition(followUp.terminationCondition ?? "none");
  }

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          resetFields();
        }

        setOpen(nextOpen);
      }}
    >
      <ResponsiveOverlayTrigger asChild>
        <Button
          disabled={disabled}
          size="sm"
          tabIndex={-1}
          type="button"
          variant="ghost"
        >
          <Pencil data-icon="inline-start" />
          Edit
        </Button>
      </ResponsiveOverlayTrigger>
      <ResponsiveOverlayContent className="sm:max-w-lg">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Edit follow-up</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Update this follow-up&apos;s details. Only pending follow-ups can be edited.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <form action={formAction}>
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <FieldGroup>
              <Field data-invalid={Boolean(state.fieldErrors?.title?.[0])}>
                <FieldLabel htmlFor="edit-follow-up-title">Title</FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(state.fieldErrors?.title?.[0])}
                    id="edit-follow-up-title"
                    maxLength={160}
                    name="title"
                    onChange={(event) => setTitle(event.currentTarget.value)}
                    required
                    value={title}
                  />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(state.fieldErrors?.reason?.[0])}>
                <FieldLabel htmlFor="edit-follow-up-reason">What do you need to do?</FieldLabel>
                <FieldContent>
                  <Textarea
                    aria-invalid={Boolean(state.fieldErrors?.reason?.[0])}
                    id="edit-follow-up-reason"
                    maxLength={500}
                    name="reason"
                    onChange={(event) => setReason(event.currentTarget.value)}
                    required
                    rows={3}
                    value={reason}
                  />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(state.fieldErrors?.dueDate?.[0])}>
                <FieldLabel htmlFor="edit-follow-up-due-date">When?</FieldLabel>
                <FieldContent>
                  <DatePicker
                    ariaInvalid={Boolean(state.fieldErrors?.dueDate?.[0])}
                    id="edit-follow-up-due-date"
                    name="dueDate"
                    onChange={setDueDate}
                    required
                    value={dueDate}
                  />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(state.fieldErrors?.channel?.[0])}>
                <FieldLabel htmlFor="edit-follow-up-channel">How?</FieldLabel>
                <FieldContent>
                  <input name="channel" type="hidden" value={channel} />
                  <Combobox
                    aria-invalid={Boolean(state.fieldErrors?.channel?.[0])}
                    id="edit-follow-up-channel"
                    onValueChange={(value) => setChannel(value as FollowUpChannel)}
                    options={channelOptions}
                    placeholder="Choose channel"
                    value={channel}
                  />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(state.fieldErrors?.sendMode?.[0])}>
                <FieldLabel htmlFor="edit-follow-up-send-mode">How should this send?</FieldLabel>
                <FieldDescription>
                  {sendMode === "automatic"
                    ? "Emailed to the customer automatically at the due time."
                    : "You'll send it yourself when it's due."}
                </FieldDescription>
                <FieldContent>
                  <input name="sendMode" type="hidden" value={sendMode} />
                  <Combobox
                    aria-invalid={Boolean(state.fieldErrors?.sendMode?.[0])}
                    id="edit-follow-up-send-mode"
                    onValueChange={(value) => setSendMode(value as FollowUpSendMode)}
                    options={availableSendModeOptions}
                    placeholder="Choose send mode"
                    value={sendMode}
                  />
                </FieldContent>
              </Field>

              {!canSendAutomatically ? (
                <p className="text-sm text-muted-foreground">
                  Automatic sending is available on the Pro plan and above.
                </p>
              ) : null}

              {sendMode === "automatic" && channel !== "email" && (
                <p className="text-sm text-destructive" role="alert">
                  Automatic sending is only available for the email channel.
                </p>
              )}

              <Field data-invalid={Boolean(state.fieldErrors?.recurrence?.[0])}>
                <FieldLabel htmlFor="edit-follow-up-recurrence">Repeat</FieldLabel>
                <FieldContent>
                  <input name="recurrence" type="hidden" value={recurrence} />
                  <Combobox
                    aria-invalid={Boolean(state.fieldErrors?.recurrence?.[0])}
                    id="edit-follow-up-recurrence"
                    onValueChange={(value) => {
                      setRecurrence(value as FollowUpRecurrence);
                      if (value === "none") {
                        setTerminationCondition("none");
                        setRecurrenceLimit("");
                      }
                    }}
                    options={recurrenceOptions}
                    placeholder="Don't repeat"
                    value={recurrence}
                  />
                </FieldContent>
              </Field>

              {recurrence !== "none" && (
                <Field data-invalid={Boolean(state.fieldErrors?.terminationCondition?.[0])}>
                  <FieldLabel htmlFor="edit-follow-up-termination-condition">
                    Stop when
                  </FieldLabel>
                  <FieldContent>
                    <input
                      name="terminationCondition"
                      type="hidden"
                      value={terminationCondition === "none" ? "" : terminationCondition}
                    />
                    <Combobox
                      aria-invalid={Boolean(state.fieldErrors?.terminationCondition?.[0])}
                      id="edit-follow-up-termination-condition"
                      onValueChange={(value) => {
                        setTerminationCondition(value as FollowUpTerminationCondition | "none");
                        if (value !== "count") {
                          setRecurrenceLimit("");
                        }
                      }}
                      options={terminationConditionOptions}
                      placeholder="No end condition"
                      value={terminationCondition}
                    />
                  </FieldContent>
                </Field>
              )}

              {recurrence !== "none" && terminationCondition === "count" && (
                <Field data-invalid={Boolean(state.fieldErrors?.recurrenceLimit?.[0])}>
                  <FieldLabel htmlFor="edit-follow-up-recurrence-limit">
                    Maximum occurrences
                  </FieldLabel>
                  <FieldDescription>How many times this follow-up should repeat (1–100).</FieldDescription>
                  <FieldContent>
                    <Input
                      aria-invalid={Boolean(state.fieldErrors?.recurrenceLimit?.[0])}
                      id="edit-follow-up-recurrence-limit"
                      max={100}
                      min={1}
                      name="recurrenceLimit"
                      onChange={(event) => setRecurrenceLimit(event.currentTarget.value)}
                      placeholder="e.g. 5"
                      required
                      type="number"
                      value={recurrenceLimit}
                    />
                  </FieldContent>
                </Field>
              )}

              {recurrence !== "none" && terminationCondition === "terminal_status" && !hasLinkedItem && (
                <p className="text-sm text-destructive" role="alert">
                  A linked inquiry or quote is required for this end condition.
                </p>
              )}

              <Field data-invalid={Boolean(state.fieldErrors?.category?.[0])}>
                <FieldLabel htmlFor="edit-follow-up-category">Category</FieldLabel>
                <FieldContent>
                  <input name="category" type="hidden" value={category} />
                  <Combobox
                    aria-invalid={Boolean(state.fieldErrors?.category?.[0])}
                    id="edit-follow-up-category"
                    onValueChange={(value) => setCategory(value as FollowUpCategory)}
                    options={[...categoryOptions]}
                    placeholder="Choose category"
                    value={category}
                  />
                </FieldContent>
              </Field>
            </FieldGroup>
          </div>
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button disabled={isPending} type="button" variant="ghost">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button disabled={isPending} type="submit">
              {isPending ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : null}
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
