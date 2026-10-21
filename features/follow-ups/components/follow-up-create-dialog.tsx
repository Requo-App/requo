"use client";

import { useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";

import { OptimisticPendingIndicator } from "@/components/shared/optimistic-pending-indicator";
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
import { Textarea } from "@/components/ui/textarea";
import { useDeferredActionState } from "@/hooks/use-deferred-action-state";
import { safeHasFeatureAccess } from "@/features/paywall/lib/utils";
import type { BusinessPlan } from "@/lib/plans/plans";
import type {
  FollowUpCategory,
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

type FollowUpCreateAction = (
  state: FollowUpCreateActionState,
  formData: FormData,
) => Promise<FollowUpCreateActionState>;

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

export function FollowUpCreateDialog({
  action,
  defaultChannel = "email",
  defaultDueDate,
  defaultReason,
  defaultTitle,
  description = "Set a simple reminder for the next customer touchpoint.",
  hasLinkedItem = false,
  onOptimisticInsert,
  plan = "free",
  timezone,
  triggerLabel = "Set follow-up",
  triggerVariant = "outline",
}: {
  action: FollowUpCreateAction;
  defaultChannel?: FollowUpChannel;
  defaultDueDate?: string;
  defaultReason: string;
  defaultTitle: string;
  description?: string;
  hasLinkedItem?: boolean;
  onOptimisticInsert?: () => void;
  /** Business plan — automatic sending is a paid capability. */
  plan?: BusinessPlan;
  /** Business timezone — the default due date is read in it. */
  timezone?: string;
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const canSendAutomatically = safeHasFeatureAccess(plan, "autoFollowUps");
  const availableSendModeOptions = sendModeOptions.filter(
    (option) => option.value !== "automatic" || canSendAutomatically,
  );
  const resolvedDefaultDueDate =
    defaultDueDate ?? getQuickFollowUpDueDate("3d", new Date(), timezone);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [reason, setReason] = useState(defaultReason);
  const [channel, setChannel] = useState<FollowUpChannel>(defaultChannel);
  const [sendMode, setSendMode] = useState<FollowUpSendMode>("manual");
  const [category, setCategory] = useState<FollowUpCategory>("sales");
  const [dueDate, setDueDate] = useState(resolvedDefaultDueDate);
  const [recurrence, setRecurrence] = useState<FollowUpRecurrence>("none");
  const [recurrenceLimit, setRecurrenceLimit] = useState("");
  const [terminationCondition, setTerminationCondition] = useState<FollowUpTerminationCondition | "none">("none");
  const [state, formAction, isPending] = useDeferredActionState(
    action,
    {} as FollowUpCreateActionState,
    {
      onOptimistic: onOptimisticInsert,
      onSuccess: () => {
        setOpen(false);
      },
    },
  );

  function resetFields() {
    setTitle(defaultTitle);
    setReason(defaultReason);
    setChannel(defaultChannel);
    setSendMode("manual");
    setCategory("sales");
    setDueDate(resolvedDefaultDueDate);
    setRecurrence("none");
    setRecurrenceLimit("");
    setTerminationCondition("none");
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
        <Button type="button" variant={triggerVariant}>
          <CalendarPlus data-icon="inline-start" />
          {triggerLabel}
        </Button>
      </ResponsiveOverlayTrigger>
      <ResponsiveOverlayContent className="sm:max-w-2xl">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>Set follow-up</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>{description}</ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>
        <form action={formAction}>
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_15rem]">
              <FieldGroup>
                <Field data-invalid={Boolean(state.fieldErrors?.title?.[0])}>
                  <FieldLabel htmlFor="follow-up-title">Title</FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={Boolean(state.fieldErrors?.title?.[0])}
                      id="follow-up-title"
                      maxLength={160}
                      name="title"
                      onChange={(event) => setTitle(event.currentTarget.value)}
                      required
                      value={title}
                    />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(state.fieldErrors?.reason?.[0])}>
                  <FieldLabel htmlFor="follow-up-reason">What do you need to do?</FieldLabel>
                  <FieldContent>
                    <Textarea
                      aria-invalid={Boolean(state.fieldErrors?.reason?.[0])}
                      id="follow-up-reason"
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
                  <FieldLabel htmlFor="follow-up-due-date">When?</FieldLabel>
                  <FieldContent>
                    <DatePicker
                      ariaInvalid={Boolean(state.fieldErrors?.dueDate?.[0])}
                      id="follow-up-due-date"
                      name="dueDate"
                      onChange={setDueDate}
                      required
                      value={dueDate}
                    />
                  </FieldContent>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={() => setDueDate(getQuickFollowUpDueDate("tomorrow", new Date(), timezone))}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      Tomorrow
                    </Button>
                    <Button
                      onClick={() => setDueDate(getQuickFollowUpDueDate("3d", new Date(), timezone))}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      In 3 days
                    </Button>
                    <Button
                      onClick={() => setDueDate(getQuickFollowUpDueDate("7d", new Date(), timezone))}
                      size="xs"
                      type="button"
                      variant="outline"
                    >
                      In 7 days
                    </Button>
                  </div>
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field data-invalid={Boolean(state.fieldErrors?.channel?.[0])}>
                  <FieldLabel htmlFor="follow-up-channel">How?</FieldLabel>
                  <FieldContent>
                    <input name="channel" type="hidden" value={channel} />
                    <Combobox
                      aria-invalid={Boolean(state.fieldErrors?.channel?.[0])}
                      id="follow-up-channel"
                      onValueChange={(value) => setChannel(value as FollowUpChannel)}
                      options={channelOptions}
                      placeholder="Choose channel"
                      value={channel}
                    />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(state.fieldErrors?.sendMode?.[0])}>
                  <FieldLabel htmlFor="follow-up-send-mode">How should this send?</FieldLabel>
                  <FieldDescription>
                    {sendMode === "automatic"
                      ? "Emailed to the customer automatically at the due time."
                      : "You'll send it yourself when it's due."}
                  </FieldDescription>
                  <FieldContent>
                    <input name="sendMode" type="hidden" value={sendMode} />
                    <Combobox
                      aria-invalid={Boolean(state.fieldErrors?.sendMode?.[0])}
                      id="follow-up-send-mode"
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

                <Field data-invalid={Boolean(state.fieldErrors?.category?.[0])}>
                  <FieldLabel htmlFor="follow-up-category">Category</FieldLabel>
                  <FieldContent>
                    <input name="category" type="hidden" value={category} />
                    <Combobox
                      aria-invalid={Boolean(state.fieldErrors?.category?.[0])}
                      id="follow-up-category"
                      onValueChange={(value) => setCategory(value as FollowUpCategory)}
                      options={[...categoryOptions]}
                      placeholder="Choose category"
                      value={category}
                    />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(state.fieldErrors?.recurrence?.[0])}>
                  <FieldLabel htmlFor="follow-up-recurrence">Repeat</FieldLabel>
                  <FieldContent>
                    <input name="recurrence" type="hidden" value={recurrence} />
                    <Combobox
                      aria-invalid={Boolean(state.fieldErrors?.recurrence?.[0])}
                      id="follow-up-recurrence"
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
                    <FieldLabel htmlFor="follow-up-termination-condition">
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
                        id="follow-up-termination-condition"
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
                    <FieldLabel htmlFor="follow-up-recurrence-limit">
                      Maximum occurrences
                    </FieldLabel>
                    <FieldDescription>How many times this follow-up should repeat (1–100).</FieldDescription>
                    <FieldContent>
                      <Input
                        aria-invalid={Boolean(state.fieldErrors?.recurrenceLimit?.[0])}
                        id="follow-up-recurrence-limit"
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
              </FieldGroup>
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
              <Plus data-icon="inline-start" />
              Create
            </Button>
          </ResponsiveOverlayFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}
