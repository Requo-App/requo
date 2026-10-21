"use client";

import { useCallback, useState } from "react";
import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { Combobox } from "@/components/ui/combobox";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayClose,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
  ResponsiveOverlayTrigger,
} from "@/components/ui/responsive-overlay";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Spinner } from "@/components/ui/spinner";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useProgressRouter } from "@/hooks/use-progress-router";
import { safeHasFeatureAccess } from "@/features/paywall/lib/utils";
import type { BusinessPlan } from "@/lib/plans/plans";
import type {
  FollowUpChannel,
  FollowUpCreateActionState,
  FollowUpRecurrence,
  FollowUpSendMode,
  FollowUpTerminationCondition,
} from "@/features/follow-ups/types";
import { followUpChannels, followUpRecurrences, followUpSendModes, followUpTerminationConditions } from "@/features/follow-ups/types";
import {
  followUpChannelLabels,
  followUpRecurrenceLabels,
  followUpSendModeLabels,
  followUpTerminationConditionLabels,
  getQuickFollowUpDueDate,
} from "@/features/follow-ups/utils";
import {
  createInquiryFollowUpAction,
  createQuoteFollowUpAction,
} from "@/features/follow-ups/actions";

export type QuickCreateRecord = {
  kind: "inquiry" | "quote";
  id: string;
  label: string;
};

type CreateFollowUpButtonProps = {
  businessSlug: string;
  records?: QuickCreateRecord[];
  /** Business plan — automatic sending is a paid capability. */
  plan?: BusinessPlan;
  /** Business timezone — the default due date is read in it. */
  timezone?: string;
};

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

export function CreateFollowUpButton({
  businessSlug: _businessSlug,
  records = [],
  plan = "free",
  timezone,
}: CreateFollowUpButtonProps) {
  const router = useProgressRouter();
  const canSendAutomatically = safeHasFeatureAccess(plan, "autoFollowUps");
  const availableSendModeOptions = sendModeOptions.filter(
    (option) => option.value !== "automatic" || canSendAutomatically,
  );
  const [open, setOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState("");
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [channel, setChannel] = useState<FollowUpChannel>("email");
  const [sendMode, setSendMode] = useState<FollowUpSendMode>("manual");
  const [dueDate, setDueDate] = useState(
    getQuickFollowUpDueDate("3d", new Date(), timezone),
  );
  const [recurrence, setRecurrence] = useState<FollowUpRecurrence>("none");
  const [recurrenceLimit, setRecurrenceLimit] = useState("");
  const [terminationCondition, setTerminationCondition] = useState<FollowUpTerminationCondition | "none">("none");

  const action = useCallback(
    async (prevState: FollowUpCreateActionState, formData: FormData) => {
      const record = records.find((r) => `${r.kind}:${r.id}` === selectedRecord);

      if (!record) {
        return { error: "Select an inquiry or quote to follow up on." };
      }

      if (record.kind === "inquiry") {
        return createInquiryFollowUpAction(record.id, prevState, formData);
      }

      return createQuoteFollowUpAction(record.id, prevState, formData);
    },
    [selectedRecord, records],
  );

  const [state, formAction, isPending] = useActionStateWithSonner(
    async (prevState, formData) => {
      const nextState = await action(prevState, formData);

      if (nextState.success) {
        setOpen(false);
        router.refresh();
      }

      return nextState;
    },
    {} as FollowUpCreateActionState,
  );

  function resetFields() {
    setSelectedRecord("");
    setTitle("");
    setReason("");
    setChannel("email");
    setSendMode("manual");
    setDueDate(getQuickFollowUpDueDate("3d", new Date(), timezone));
    setRecurrence("none");
    setRecurrenceLimit("");
    setTerminationCondition("none");
  }

  const recordOptions = records.map((r) => ({
    label: r.label,
    value: `${r.kind}:${r.id}`,
  }));

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
          aria-label="Create follow-up"
          title="Create follow-up"
          size="sm"
          className={mobileNavbarIconButtonClassName}
          type="button"
        >
          <CalendarPlus data-icon="inline-start" />
          <span className="hidden lg:inline">Create</span>
        </Button>
      </ResponsiveOverlayTrigger>
      <ResponsiveOverlayContent className="sm:max-w-lg flex flex-col">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Create follow-up</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>
            Pick an inquiry or quote and set a follow-up reminder.
          </ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <ResponsiveOverlayBody>
            <FieldGroup>
              {records.length > 0 && (
                <Field>
                  <FieldLabel htmlFor="quick-create-record">Inquiry or quote</FieldLabel>
                  <FieldContent>
                    <Combobox
                      id="quick-create-record"
                      onValueChange={setSelectedRecord}
                      options={recordOptions}
                      placeholder="Search inquiries and quotes..."
                      value={selectedRecord}
                    />
                  </FieldContent>
                </Field>
              )}

              <Field data-invalid={Boolean(state.fieldErrors?.title?.[0])}>
                <FieldLabel htmlFor="quick-create-title">Title</FieldLabel>
                <FieldContent>
                  <Input
                    aria-invalid={Boolean(state.fieldErrors?.title?.[0])}
                    id="quick-create-title"
                    maxLength={160}
                    name="title"
                    onChange={(event) => setTitle(event.currentTarget.value)}
                    placeholder="e.g. Check in on quote response"
                    required
                    value={title}
                  />
                </FieldContent>
              </Field>

              <Field data-invalid={Boolean(state.fieldErrors?.reason?.[0])}>
                <FieldLabel htmlFor="quick-create-reason">Reason</FieldLabel>
                <FieldContent>
                  <Textarea
                    aria-invalid={Boolean(state.fieldErrors?.reason?.[0])}
                    id="quick-create-reason"
                    maxLength={500}
                    name="reason"
                    onChange={(event) => setReason(event.currentTarget.value)}
                    placeholder="Why does this need a follow-up?"
                    required
                    rows={2}
                    value={reason}
                  />
                </FieldContent>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(state.fieldErrors?.channel?.[0])}>
                  <FieldLabel htmlFor="quick-create-channel">Channel</FieldLabel>
                  <FieldContent>
                    <input name="channel" type="hidden" value={channel} />
                    <Combobox
                      aria-invalid={Boolean(state.fieldErrors?.channel?.[0])}
                      id="quick-create-channel"
                      onValueChange={(value) => setChannel(value as FollowUpChannel)}
                      options={channelOptions}
                      placeholder="Choose channel"
                      value={channel}
                    />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(state.fieldErrors?.sendMode?.[0])}>
                  <FieldLabel htmlFor="quick-create-send-mode">Send mode</FieldLabel>
                  <FieldDescription>
                    {sendMode === "automatic"
                      ? "Automated: emailed to the customer automatically when due."
                      : "Manual: you'll send it yourself when it's due."}
                  </FieldDescription>
                  <FieldContent>
                    <input name="sendMode" type="hidden" value={sendMode} />
                    <Combobox
                      aria-invalid={Boolean(state.fieldErrors?.sendMode?.[0])}
                      id="quick-create-send-mode"
                      onValueChange={(value) => setSendMode(value as FollowUpSendMode)}
                      options={availableSendModeOptions}
                      placeholder="Choose send mode"
                      value={sendMode}
                    />
                  </FieldContent>
                </Field>
              </div>

              {sendMode === "automatic" && channel !== "email" && (
                <p className="text-sm text-destructive" role="alert">
                  Automatic sending is only available for the email channel.
                </p>
              )}

              {!canSendAutomatically ? (
                <p className="text-sm text-muted-foreground">
                  Automatic sending is available on the Pro plan and above.
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={Boolean(state.fieldErrors?.dueDate?.[0])}>
                  <FieldLabel htmlFor="quick-create-due-date">Due date</FieldLabel>
                  <FieldContent>
                    <DatePicker
                      ariaInvalid={Boolean(state.fieldErrors?.dueDate?.[0])}
                      id="quick-create-due-date"
                      name="dueDate"
                      onChange={setDueDate}
                      required
                      value={dueDate}
                    />
                  </FieldContent>
                </Field>
              </div>

              <Field>
                <FieldLabel>Quick dates</FieldLabel>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => setDueDate(getQuickFollowUpDueDate("tomorrow", new Date(), timezone))}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Tomorrow
                  </Button>
                  <Button
                    onClick={() => setDueDate(getQuickFollowUpDueDate("3d", new Date(), timezone))}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    In 3 days
                  </Button>
                  <Button
                    onClick={() => setDueDate(getQuickFollowUpDueDate("7d", new Date(), timezone))}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    In 7 days
                  </Button>
                </div>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="quick-create-recurrence">Repeat</FieldLabel>
                  <FieldContent>
                    <input name="recurrence" type="hidden" value={recurrence} />
                    <Combobox
                      id="quick-create-recurrence"
                      onValueChange={(value) => {
                        setRecurrence(value as FollowUpRecurrence);
                        if (value === "none") {
                          setTerminationCondition("none");
                          setRecurrenceLimit("");
                        }
                      }}
                      options={recurrenceOptions}
                      placeholder="No repeat"
                      value={recurrence}
                    />
                  </FieldContent>
                </Field>

                {recurrence !== "none" && (
                  <Field>
                    <FieldLabel htmlFor="quick-create-termination-condition">End condition</FieldLabel>
                    <FieldContent>
                      <input
                        name="terminationCondition"
                        type="hidden"
                        value={terminationCondition === "none" ? "" : terminationCondition}
                      />
                      <Combobox
                        id="quick-create-termination-condition"
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
              </div>

              {recurrence !== "none" && terminationCondition === "count" && (
                <Field>
                  <FieldLabel htmlFor="quick-create-recurrence-limit">Maximum occurrences</FieldLabel>
                  <FieldDescription>How many times this follow-up should repeat (1–100).</FieldDescription>
                  <FieldContent>
                    <Input
                      id="quick-create-recurrence-limit"
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

              {recurrence !== "none" && terminationCondition === "terminal_status" && !selectedRecord && (
                <p className="text-sm text-destructive" role="alert">
                  A linked inquiry or quote is required for this end condition.
                </p>
              )}
            </FieldGroup>
          </ResponsiveOverlayBody>
          <ResponsiveOverlayFooter>
            <ResponsiveOverlayClose asChild>
              <Button disabled={isPending} type="button" variant="ghost">
                Cancel
              </Button>
            </ResponsiveOverlayClose>
            <Button disabled={isPending} type="submit">
              {isPending ? (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              ) : (
                <CalendarPlus data-icon="inline-start" />
              )}
              {isPending ? "Creating..." : "Create"}
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
