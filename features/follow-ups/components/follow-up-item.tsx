"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  Mail,
  MessageSquare,
  MoreVertical,
  Pencil,
  Phone,
  Trash2,
} from "lucide-react";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  completeFollowUpAction,
  deleteFollowUpAction,
  editFollowUpAction,
  reassignFollowUpAction,
  rescheduleFollowUpAction,
  skipFollowUpAction,
  snoozeFollowUpAction,
} from "@/features/follow-ups/actions";
import { FollowUpActions } from "@/features/follow-ups/components/follow-up-actions";
import { FollowUpAiMessageButton } from "@/features/follow-ups/components/follow-up-ai-message-button";
import { FollowUpEditDialog } from "@/features/follow-ups/components/follow-up-edit-dialog";
import { FollowUpMessageCopyButton } from "@/features/follow-ups/components/follow-up-message-copy-button";
import {
  FollowUpReassignDialog,
  type TeamMemberOption,
} from "@/features/follow-ups/components/follow-up-reassign-dialog";
import {
  FollowUpDueBadge,
  FollowUpSendModeBadge,
  FollowUpStatusBadge,
} from "@/features/follow-ups/components/follow-up-status-badge";
import type {
  FollowUpChannel,
  FollowUpCompleteActionState,
  FollowUpDeleteActionState,
  FollowUpEditActionState,
  FollowUpRecordActionState,
  FollowUpRescheduleActionState,
  FollowUpSnoozeActionState,
  FollowUpView,
} from "@/features/follow-ups/types";
import {
  formatFollowUpDate,
  formatQuoteAmount,
  getFollowUpChannelLabel,
  followUpRecurrenceLabels,
  followUpTerminationConditionLabels,
} from "@/features/follow-ups/utils";
import {
  getBusinessInquiryPath,
  getBusinessQuotePath,
} from "@/features/businesses/routes";
import { useDeferredActionState } from "@/hooks/use-deferred-action-state";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import type { MotionState } from "@/hooks/use-animated-list";
import { cn } from "@/lib/utils";

export function getFollowUpRelatedHref(
  businessSlug: string,
  followUp: FollowUpView,
) {
  return followUp.related.kind === "quote"
    ? getBusinessQuotePath(businessSlug, followUp.related.id)
    : getBusinessInquiryPath(businessSlug, followUp.related.id);
}

function ChannelIcon({
  channel,
  className,
}: {
  channel: FollowUpChannel;
  className?: string;
}) {
  switch (channel) {
    case "email":
      return <Mail className={cn("size-3", className)} aria-hidden="true" />;
    case "phone":
      return <Phone className={cn("size-3", className)} aria-hidden="true" />;
    default:
      return (
        <MessageSquare className={cn("size-3", className)} aria-hidden="true" />
      );
  }
}

type FollowUpItemProps = {
  businessSlug: string;
  businessName?: string;
  className?: string;
  compact?: boolean;
  followUp: FollowUpView;
  members?: TeamMemberOption[];
  showMessage?: boolean;
  aiTone?: "balanced" | "warm" | "direct" | "formal";
  motionState?: MotionState;
  itemRef?: (node: HTMLElement | null) => void;
  onOptimisticRemove?: () => void;
  completeAction?: (
    state: FollowUpCompleteActionState,
    formData: FormData,
  ) => Promise<FollowUpCompleteActionState>;
  skipAction?: (
    state: FollowUpRecordActionState,
    formData: FormData,
  ) => Promise<FollowUpRecordActionState>;
  rescheduleAction?: (
    state: FollowUpRescheduleActionState,
    formData: FormData,
  ) => Promise<FollowUpRescheduleActionState>;
  snoozeAction?: (
    state: FollowUpSnoozeActionState,
    formData: FormData,
  ) => Promise<FollowUpSnoozeActionState>;
  editAction?: (
    state: FollowUpEditActionState,
    formData: FormData,
  ) => Promise<FollowUpEditActionState>;
  deleteAction?: (
    state: FollowUpDeleteActionState,
    formData: FormData,
  ) => Promise<FollowUpDeleteActionState>;
  reassignAction?: (
    state: {
      error?: string;
      success?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    },
    formData: FormData,
  ) => Promise<{
    error?: string;
    success?: string;
    fieldErrors?: Record<string, string[] | undefined>;
  }>;
};

export function FollowUpItem({
  businessSlug,
  businessName,
  className,
  compact: _compact = false,
  followUp,
  members = [],
  showMessage = true,
  aiTone = "balanced",
  motionState,
  itemRef,
  onOptimisticRemove,
  completeAction: completeActionProp,
  skipAction: skipActionProp,
  rescheduleAction: rescheduleActionProp,
  snoozeAction: snoozeActionProp,
  editAction: editActionProp,
  deleteAction: deleteActionProp,
  reassignAction: reassignActionProp,
}: FollowUpItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const editTriggerRef = useRef<HTMLDivElement>(null);
  const { refreshNow } = useDeferredRefresh();
  const deleteFormRef = useRef<HTMLFormElement>(null);
  const relatedHref = getFollowUpRelatedHref(businessSlug, followUp);

  const completeAction =
    completeActionProp ?? completeFollowUpAction.bind(null, followUp.id);
  const skipAction = skipActionProp ?? skipFollowUpAction.bind(null, followUp.id);
  const rescheduleAction =
    rescheduleActionProp ?? rescheduleFollowUpAction.bind(null, followUp.id);
  const snoozeAction =
    snoozeActionProp ?? snoozeFollowUpAction.bind(null, followUp.id);
  const editAction = editActionProp ?? editFollowUpAction.bind(null, followUp.id);
  const deleteAction =
    deleteActionProp ?? deleteFollowUpAction.bind(null, followUp.id);
  const reassignAction =
    reassignActionProp ?? reassignFollowUpAction.bind(null, followUp.id);

  const [, deleteFormAction, isDeletePending] = useDeferredActionState(
    deleteAction,
    {} as FollowUpDeleteActionState,
    {
      onOptimistic: onOptimisticRemove,
      onRevert: refreshNow,
      onSuccess: () => {
        setShowDeleteConfirm(false);
      },
    },
  );

  const channelLabel = getFollowUpChannelLabel(followUp.channel);
  const dueLabel = formatFollowUpDate(followUp.dueAt);
  const isPending = followUp.status === "pending";
  const staleLabel = (() => {
    switch (followUp.quoteContext?.status) {
      case "accepted":
        return "Quote accepted · No action needed";
      case "rejected":
        return "Quote rejected · No action needed";
      case "expired":
        return "Quote expired · No action needed";
      case "voided":
        return "Quote voided · No action needed";
      default:
        return null;
    }
  })();
  const quoteAmount = followUp.quoteContext
    ? formatQuoteAmount(
        followUp.quoteContext.totalInCents,
        followUp.quoteContext.currency,
      )
    : null;

  return (
    <div
      ref={itemRef}
      className={cn(
        "motion-list-item rounded-xl border border-border/60 bg-background transition-colors",
        expanded ? "border-border/80" : "hover:border-border/80",
        className,
      )}
      data-expanded={expanded}
      data-motion-state={motionState}
    >
      {/* Header row: identity + single status + chevron + overflow */}
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <button
          aria-expanded={expanded}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-md text-left",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {followUp.customerName}
              </span>
              {quoteAmount ? (
                <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground/80">
                  {quoteAmount}
                </span>
              ) : null}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {followUp.title}
            </span>
            {followUp.whyNow ? (
              <span className="truncate text-xs text-muted-foreground/80">
                {followUp.whyNow}
              </span>
            ) : null}
            <span className="truncate text-xs text-muted-foreground/70">
              {followUp.related.label} · Due {dueLabel} · via {channelLabel}
            </span>
            {staleLabel ? (
              <span className="truncate text-xs text-muted-foreground/70">
                {staleLabel}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isPending ? (
              <FollowUpDueBadge bucket={followUp.dueBucket} />
            ) : (
              <FollowUpStatusBadge status={followUp.status} />
            )}
            <FollowUpSendModeBadge sendMode={followUp.sendMode ?? "manual"} />
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="More actions"
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {isPending ? (
              <DropdownMenuItem
                onSelect={() => {
                  const btn = editTriggerRef.current?.querySelector("button");
                  btn?.click();
                }}
              >
                <Pencil />
                Edit
              </DropdownMenuItem>
            ) : null}
            {members.length > 1 && isPending ? (
              <DropdownMenuItem disabled>Reassign</DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setShowDeleteConfirm(true)}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Expanded body */}
      {expanded ? (
        <div className="flex flex-col gap-4 border-t border-border/40 px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5">
          {/* Meta row + reason */}
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" aria-hidden="true" />
                {dueLabel}
              </span>
              <span
                aria-hidden="true"
                className="size-1 rounded-full bg-muted-foreground/40"
              />
              <span className="inline-flex items-center gap-1">
                <ChannelIcon channel={followUp.channel} />
                {channelLabel}
              </span>
              <span
                aria-hidden="true"
                className="size-1 rounded-full bg-muted-foreground/40"
              />
              <Link
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                href={relatedHref}
                prefetch={true}
              >
                {followUp.related.label}
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
            {followUp.whyNow ? (
              <p className="text-sm leading-6 text-foreground">
                {followUp.whyNow}
              </p>
            ) : null}
            <p className="text-sm leading-6 text-muted-foreground">
              {followUp.reason}
            </p>
            {staleLabel ? (
              <p className="text-xs text-muted-foreground">{staleLabel}</p>
            ) : null}

            {/* Recurrence schedule and termination rule */}
            {followUp.recurrence !== "none" && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Repeats {followUpRecurrenceLabels[followUp.recurrence].toLowerCase()}
                </span>
                {followUp.terminationCondition === "count" && followUp.recurrenceLimit && (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-1 rounded-full bg-muted-foreground/40"
                    />
                    <span>
                      {followUp.recurrenceCount} of {followUp.recurrenceLimit} occurrences
                    </span>
                  </>
                )}
                {followUp.terminationCondition === "terminal_status" && (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-1 rounded-full bg-muted-foreground/40"
                    />
                    <span>
                      {followUpTerminationConditionLabels.terminal_status}
                    </span>
                  </>
                )}
                {!followUp.terminationCondition && followUp.recurrenceLimit && (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-1 rounded-full bg-muted-foreground/40"
                    />
                    <span>
                      {followUp.recurrenceCount} of {followUp.recurrenceLimit} repeats
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Suggested message */}
          {showMessage && followUp.suggestedMessage ? (
            <div data-padding="none" className="soft-panel flex flex-col gap-2.5 px-4 py-3.5 shadow-none">
              <p className="meta-label">Suggested message</p>
              <p className="text-sm leading-6 text-foreground">
                {followUp.suggestedMessage}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <FollowUpMessageCopyButton message={followUp.suggestedMessage} />
                {isPending && businessName ? (
                  <FollowUpAiMessageButton
                    aiTone={aiTone}
                    businessName={businessName}
                    channel={followUp.channel}
                    customerName={followUp.customerName}
                    followUpReason={followUp.reason}
                    followUpTitle={followUp.title}
                    quoteUrl={followUp.quotePublicUrl}
                    quoteViewed={Boolean(followUp.quoteViewedAt)}
                    recordKind={followUp.related.kind}
                  />
                ) : null}
              </div>
            </div>
          ) : showMessage && isPending && businessName ? (
            <FollowUpAiMessageButton
              aiTone={aiTone}
              businessName={businessName}
              channel={followUp.channel}
              customerName={followUp.customerName}
              followUpReason={followUp.reason}
              followUpTitle={followUp.title}
              quoteUrl={followUp.quotePublicUrl}
              quoteViewed={Boolean(followUp.quoteViewedAt)}
              recordKind={followUp.related.kind}
            />
          ) : null}

          {/* Workflow actions */}
          {isPending ? (
            <div className="pt-1">
              <FollowUpActions
                completeAction={completeAction}
                dueAt={followUp.dueAt}
                onOptimisticDismiss={onOptimisticRemove}
                rescheduleAction={rescheduleAction}
                skipAction={skipAction}
                snoozeAction={snoozeAction}
              />
            </div>
          ) : null}

          {/* Completion note */}
          {followUp.completionNote ? (
            <div data-padding="none" className="soft-panel px-4 py-3 shadow-none">
              <p className="meta-label mb-1">Outcome</p>
              <p className="text-sm text-foreground">{followUp.completionNote}</p>
            </div>
          ) : null}

          {/* Snoozed indicator */}
          {followUp.snoozedUntil && isPending ? (
            <p className="text-xs text-muted-foreground">
              Snoozed until {formatFollowUpDate(followUp.snoozedUntil)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Edit dialog — trigger hidden, opened via ref */}
      {isPending ? (
        <div ref={editTriggerRef} className="sr-only">
          <FollowUpEditDialog action={editAction} followUp={followUp} />
        </div>
      ) : null}

      {/* Delete confirm */}
      <form ref={deleteFormRef} action={deleteFormAction} className="hidden" />
      <ConfirmationDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete this follow-up?"
        description={
          <>
            This removes &ldquo;{followUp.title}&rdquo; from your list. This
            cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => deleteFormRef.current?.requestSubmit()}
        isPending={isDeletePending}
        tone="destructive"
        icon={Trash2}
      />

      {/* Reassign (hidden, for members > 1) */}
      {members.length > 1 && isPending ? (
        <div className="hidden">
          <FollowUpReassignDialog
            action={reassignAction}
            currentAssignedUserId={followUp.assignedToUserId}
            members={members}
          />
        </div>
      ) : null}
    </div>
  );
}
