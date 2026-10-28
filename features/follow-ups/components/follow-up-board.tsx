"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  SkipForward,
  Sunrise,
} from "lucide-react";
import { useProgressiveReveal } from "@/hooks/use-progressive-reveal";
import { LIST_EXIT_MS, useListFlip } from "@/hooks/use-animated-list";

import { OptimisticPendingIndicator } from "@/components/shared/optimistic-pending-indicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { DashboardEmptyState } from "@/components/shared/dashboard-layout";
import {
  completeFollowUpAction,
  skipFollowUpAction,
} from "@/features/follow-ups/actions";
import { getFollowUpRelatedHref } from "@/features/follow-ups/components/follow-up-item";
import {
  FollowUpDueBadge,
  FollowUpSendModeBadge,
} from "@/features/follow-ups/components/follow-up-status-badge";
import { FollowUpHistorySheet } from "@/features/follow-ups/components/follow-up-history-sheet";
import { FollowUpMessageCopyButton } from "@/features/follow-ups/components/follow-up-message-copy-button";
import { getBusinessFollowUpsPath } from "@/features/businesses/routes";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import type { QuoteStatus } from "@/features/quotes/types";
import { quoteStatuses } from "@/features/quotes/types";
import {
  formatFollowUpDate,
  formatQuoteAmount,
  getFollowUpChannelLabel,
  followUpRecurrenceLabels,
} from "@/features/follow-ups/utils";
import type { FollowUpChannel, FollowUpView } from "@/features/follow-ups/types";
import type { FollowUpActivityItem } from "@/features/follow-ups/types";
import {
  type OptimisticActionResult,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation";
import { cn } from "@/lib/utils";

const quoteStatusSet = new Set<string>(quoteStatuses);

function isQuoteStatus(value: string | null | undefined): value is QuoteStatus {
  return typeof value === "string" && quoteStatusSet.has(value);
}

type AutoSequenceItem = Extract<
  FollowUpActivityItem,
  { kind: "auto_sequence" }
>;

type FollowUpBoardProps = {
  overdue: FollowUpView[];
  dueToday: FollowUpView[];
  upcoming: FollowUpView[];
  businessSlug: string;
  createButton?: React.ReactNode;
  autoSequences?: AutoSequenceItem[];
  history?: FollowUpView[];
  historyCount?: number;
};

type BoardColumns = {
  overdue: FollowUpView[];
  dueToday: FollowUpView[];
  upcoming: FollowUpView[];
};

type BoardColumnKey = keyof BoardColumns;

type BoardAction =
  | { type: "remove"; id: string }
  | { type: "restore"; followUp: FollowUpView; column: BoardColumnKey };

const columns = [  {
    key: "overdue" as const,
    label: "Needs attention now",
    icon: <AlertTriangle className="size-4 text-destructive-ink" />,
    collapsedLimit: 8,
  },
  {
    key: "dueToday" as const,
    label: "Due today",
    icon: <Sunrise className="size-4 text-primary-ink" />,
    collapsedLimit: 8,
  },
  {
    key: "upcoming" as const,
    label: "Upcoming",
    icon: <Clock className="size-4 text-muted-foreground" />,
    collapsedLimit: 8,
  },
];

function findFollowUpInBoard(board: BoardColumns, id: string) {
  for (const key of ["overdue", "dueToday", "upcoming"] as const) {
    const followUp = board[key].find((item) => item.id === id);
    if (followUp) {
      return { followUp, column: key };
    }
  }

  return null;
}

function boardReducer(current: BoardColumns, action: BoardAction): BoardColumns {
  switch (action.type) {
    case "remove":
      return {
        overdue: current.overdue.filter((item) => item.id !== action.id),
        dueToday: current.dueToday.filter((item) => item.id !== action.id),
        upcoming: current.upcoming.filter((item) => item.id !== action.id),
      };
    case "restore": {
      if (current[action.column].some((item) => item.id === action.followUp.id)) {
        return current;
      }

      return {
        ...current,
        [action.column]: [...current[action.column], action.followUp],
      };
    }
    default:
      return current;
  }
}

function ChannelIcon({ channel, className }: { channel: FollowUpChannel; className?: string }) {  switch (channel) {
    case "email":
      return <Mail className={cn("size-3", className)} aria-hidden="true" />;
    case "phone":
      return <Phone className={cn("size-3", className)} aria-hidden="true" />;
    default:
      return <MessageSquare className={cn("size-3", className)} aria-hidden="true" />;
  }
}

export function FollowUpBoard({
  overdue,
  dueToday,
  upcoming,
  businessSlug,
  createButton,
  autoSequences = [],
  history = [],
  historyCount = 0,
}: FollowUpBoardProps) {
  const serverBoard = useMemo(
    () => ({ overdue, dueToday, upcoming }),
    [overdue, dueToday, upcoming],
  );
  const [optimisticBoard, setOptimisticBoard] = useOptimistic(serverBoard, boardReducer);
  const [, startTransition] = useTransition();
  const { runMutation, isPendingKey } = useOptimisticMutation();

  const totalFollowUps =
    optimisticBoard.overdue.length +
    optimisticBoard.dueToday.length +
    optimisticBoard.upcoming.length;
  const needsAttentionCount = optimisticBoard.overdue.length;
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUpView | null>(null);

  const exitingIds = useRef(new Set<string>());
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [, forceRender] = useState(0);
  const { getItemRef, bumpFlip } = useListFlip();

  useEffect(() => {
    const timers = exitTimers.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const getMotionState = useCallback((id: string) => {
    if (exitingIds.current.has(id)) return "exiting" as const;
    return undefined;
  }, []);

  const optimisticRemove = useCallback(
    (id: string, mutation?: () => Promise<OptimisticActionResult>) => {
      const located = findFollowUpInBoard(optimisticBoard, id);
      if (!located) {
        return;
      }

      const { followUp, column } = located;

      const prev = exitTimers.current.get(id);
      if (prev) clearTimeout(prev);

      exitingIds.current.add(id);
      forceRender((n) => n + 1);

      const timer = setTimeout(() => {
        exitingIds.current.delete(id);
        exitTimers.current.delete(id);
        forceRender((n) => n + 1);

        startTransition(() => {
          setOptimisticBoard({ type: "remove", id });
        });
        bumpFlip();

        if (!mutation) {
          return;
        }

        runMutation({
          applyOptimistic: () => {},
          revertOptimistic: () => {
            startTransition(() => {
              setOptimisticBoard({ type: "restore", followUp, column });
            });
          },
          mutation,
          pendingKey: id,
        });
      }, LIST_EXIT_MS);

      exitTimers.current.set(id, timer);
    },
    [optimisticBoard, runMutation, setOptimisticBoard, startTransition, bumpFlip],
  );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {needsAttentionCount > 0
            ? `${needsAttentionCount} need${needsAttentionCount === 1 ? "s" : ""} your attention`
            : "You're all caught up"}
        </p>
        <div className="flex items-center gap-2">
          <FollowUpHistorySheet
            businessSlug={businessSlug}
            history={history}
            historyCount={historyCount}
          />
          <Button asChild size="sm" variant="ghost">
            <Link
              href={`${getBusinessFollowUpsPath(businessSlug)}?view=list`}
              prefetch={true}
            >
              View all
            </Link>
          </Button>
          {createButton}
        </div>
      </div>

      {totalFollowUps === 0 && autoSequences.length === 0 ? (
        <DashboardEmptyState
          title="No follow-ups yet"
          description="Set a reminder so you don't lose track of a customer."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {columns.map((column) => (
            <FollowUpColumn
              key={column.key}
              column={column}
              items={optimisticBoard[column.key]}
              businessSlug={businessSlug}
              autoSequences={column.key === "upcoming" ? autoSequences : []}
              onSelect={setSelectedFollowUp}
              getMotionState={getMotionState}
              getItemRef={getItemRef}
              onOptimisticRemove={optimisticRemove}
              isPendingKey={isPendingKey}
            />
          ))}
        </div>
      )}

      <FollowUpDetailDialog
        followUp={selectedFollowUp}
        businessSlug={businessSlug}
        onClose={() => setSelectedFollowUp(null)}
        onOptimisticRemove={optimisticRemove}
        isPendingKey={isPendingKey}
      />
    </>
  );
}

function FollowUpColumn({
  column,
  items,
  businessSlug,
  autoSequences,
  onSelect,
  getMotionState,
  getItemRef,
  onOptimisticRemove,
  isPendingKey,
}: {
  column: (typeof columns)[number];
  items: FollowUpView[];
  businessSlug: string;
  autoSequences: AutoSequenceItem[];
  onSelect: (followUp: FollowUpView) => void;
  getMotionState: (id: string) => "exiting" | undefined;
  getItemRef: (id: string) => (node: HTMLElement | null) => void;
  onOptimisticRemove: (
    id: string,
    mutation?: () => Promise<OptimisticActionResult>,
  ) => void;
  isPendingKey: (key: string) => boolean;
}) {
  const { visibleCount, hasMore, sentinelRef, revealMore, showFewer } =
    useProgressiveReveal({
      total: items.length,
      initialBatch: column.collapsedLimit,
      batchSize: 5,
    });
  const visibleItems = items.slice(0, visibleCount);
  const isExpanded = visibleCount > column.collapsedLimit;
  const remaining = items.length - visibleCount;

  return (
    <section
      aria-label={column.label}
      className="flex min-h-48 flex-col gap-3 rounded-xl p-4 bg-muted/50"
    >
      <div className="flex items-center gap-2">
        {column.icon}
        <span className="text-sm font-medium">{column.label}</span>
        <Badge variant="secondary" className="ml-auto rounded-full">
          {items.length + autoSequences.length}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        {visibleItems.length === 0 && autoSequences.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {column.key === "overdue"
              ? "You're all caught up — no overdue follow-ups."
              : column.key === "dueToday"
                ? "Nothing needs your attention today."
                : "Nothing scheduled."}
          </p>
        ) : null}
        {visibleItems.map((followUp) => (
          <FollowUpCard
            key={followUp.id}
            followUp={followUp}
            onSelect={onSelect}
            motionState={getMotionState(followUp.id)}
            itemRef={getItemRef(followUp.id)}
            onOptimisticRemove={onOptimisticRemove}
            isPendingKey={isPendingKey}
          />
        ))}
        {autoSequences.map((item) => (
          <AutoSequenceCard
            key={item.quoteId}
            item={item}
            businessSlug={businessSlug}
          />
        ))}
        {hasMore ? <div ref={sentinelRef} className="h-1" /> : null}
      </div>

      {items.length > column.collapsedLimit ? (
        <div className="flex items-center gap-2 pt-1">
          {hasMore ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={revealMore}
              className="text-muted-foreground"
              aria-label={`Show more ${column.label} follow-ups, ${remaining} remaining`}
            >
              <ChevronDown data-icon="inline-start" />
              Show more ({remaining} more)
            </Button>
          ) : null}
          {isExpanded ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={showFewer}
              className="text-muted-foreground"
              aria-label={`Show fewer ${column.label} follow-ups`}
            >
              <ChevronUp data-icon="inline-start" />
              Show fewer
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function getTerminalStaleLabel(status: string | null | undefined): string | null {
  switch (status) {
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
}

function FollowUpCard({
  followUp,
  onSelect,
  motionState,
  itemRef,
  onOptimisticRemove,
  isPendingKey,
}: {
  followUp: FollowUpView;
  onSelect: (followUp: FollowUpView) => void;
  motionState?: "exiting";
  itemRef?: (node: HTMLElement | null) => void;
  onOptimisticRemove: (
    id: string,
    mutation?: () => Promise<OptimisticActionResult>,
  ) => void;
  isPendingKey: (key: string) => boolean;
}) {
  const channelLabel = getFollowUpChannelLabel(followUp.channel);
  const dueLabel = formatFollowUpDate(followUp.dueAt, followUp.businessTimezone);
  const isPending = isPendingKey(followUp.id);

  function handleComplete(e: React.MouseEvent) {
    e.stopPropagation();
    onOptimisticRemove(followUp.id, async () => {
      const formData = new FormData();
      return completeFollowUpAction.bind(null, followUp.id)({}, formData);
    });
  }

  function handleSkip(e: React.MouseEvent) {
    e.stopPropagation();
    onOptimisticRemove(followUp.id, async () => {
      const formData = new FormData();
      return skipFollowUpAction.bind(null, followUp.id)({}, formData);
    });
  }

  return (
    <div
      ref={itemRef}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(followUp)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(followUp); } }}
      className="motion-list-item surface-card relative flex w-full cursor-pointer flex-col gap-2 rounded-xl p-3.5 text-left transition-colors hover:border-[var(--control-border-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      data-motion-state={motionState}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium leading-tight">
          {followUp.customerName}
        </span>
        <FollowUpSendModeBadge sendMode={followUp.sendMode ?? "manual"} />
      </div>
      <p className="line-clamp-2 text-sm leading-snug text-foreground">
        {followUp.title}
      </p>
      <p className="truncate text-xs text-muted-foreground/80">
        Due {dueLabel} · via {channelLabel}
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        <Button
          variant="default"
          size="xs"
          disabled={isPending}
          onClick={handleComplete}
        >
          <OptimisticPendingIndicator pending={isPending} />
          <CheckCircle2 data-icon="inline-start" className="size-3" />
          Done
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={isPending}
          onClick={handleSkip}
        >
          <SkipForward data-icon="inline-start" className="size-3" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function AutoSequenceCard({
  item,
  businessSlug,
}: {
  item: AutoSequenceItem;
  businessSlug: string;
}) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-dashed border-border/80 bg-card p-3.5 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium leading-tight">
          {item.customerName}
        </span>
        <FollowUpSendModeBadge sendMode="automatic" />
      </div>
      <p className="truncate text-xs text-muted-foreground/80">
        {item.quoteNumber ? `Quote ${item.quoteNumber}` : item.quoteTitle}
        {item.sequence.nextSendAt
          ? ` · Next email ${formatFollowUpDate(item.sequence.nextSendAt, item.businessTimezone)}`
          : null}
      </p>
      <div className="flex items-center gap-2 pt-0.5">
        <span className="text-xs text-muted-foreground">
          Email {item.sequence.attempts} of {item.sequence.maxAttempts}
        </span>
        <Button asChild variant="outline" size="xs" className="ml-auto">
          <Link href={`/${businessSlug}/quotes/${item.quoteId}`} prefetch={true}>
            View quote
            <ArrowRight data-icon="inline-end" className="size-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Follow-up Detail Dialog                                                    */
/* -------------------------------------------------------------------------- */

function FollowUpDetailDialog({
  followUp,
  businessSlug,
  onClose,
  onOptimisticRemove,
  isPendingKey,
}: {
  followUp: FollowUpView | null;
  businessSlug: string;
  onClose: () => void;
  onOptimisticRemove: (
    id: string,
    mutation?: () => Promise<OptimisticActionResult>,
  ) => void;
  isPendingKey: (key: string) => boolean;
}) {

  if (!followUp) {
    return null;
  }

  const relatedHref = getFollowUpRelatedHref(businessSlug, followUp);
  const channelLabel = getFollowUpChannelLabel(followUp.channel);
  const dueLabel = formatFollowUpDate(followUp.dueAt, followUp.businessTimezone);
  const hasRecurrence = followUp.recurrence !== "none";
  const isActioning = isPendingKey(followUp.id);
  const isAutomatic = (followUp.sendMode ?? "manual") === "automatic";
  const quoteAmount = followUp.quoteContext
    ? formatQuoteAmount(
        followUp.quoteContext.totalInCents,
        followUp.quoteContext.currency,
      )
    : null;
  const staleLabel = getTerminalStaleLabel(followUp.quoteContext?.status);

  function handleComplete() {
    onOptimisticRemove(followUp!.id, async () => {
      const formData = new FormData();
      const result = await completeFollowUpAction.bind(null, followUp!.id)({}, formData);
      if (result.success) {
        onClose();
      }
      return result;
    });
  }

  function handleSkip() {
    onOptimisticRemove(followUp!.id, async () => {
      const formData = new FormData();
      const result = await skipFollowUpAction.bind(null, followUp!.id)({}, formData);
      if (result.success) {
        onClose();
      }
      return result;
    });
  }

  return (
    <Dialog open={Boolean(followUp)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{followUp.title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {/* Customer row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm font-medium text-foreground">
              {followUp.customerName}
            </span>
            <span className="flex items-center gap-1.5">
              <FollowUpSendModeBadge sendMode={followUp.sendMode ?? "manual"} />
              <FollowUpDueBadge bucket={followUp.dueBucket} />
            </span>
            <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground sm:w-auto sm:ml-auto">
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" aria-hidden="true" />
                {dueLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <ChannelIcon channel={followUp.channel} className="size-3" />
                {channelLabel}
              </span>
              {hasRecurrence ? (
                <span>
                  Repeats: {followUpRecurrenceLabels[followUp.recurrence]}
                  {followUp.recurrenceLimit ? ` (${followUp.recurrenceCount}/${followUp.recurrenceLimit})` : ""}
                </span>
              ) : null}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {isAutomatic
              ? "Automated — emailed to the customer automatically at the due time."
              : "Manual — you'll send it yourself when it's due."}
          </p>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_13.5rem]">
            {/* Main column */}
            <div className="flex min-w-0 flex-col gap-4">
              {followUp.whyNow ? (
                <div className="flex flex-col gap-1.5">
                  <span className="meta-label">Why now</span>
                  <p className="text-sm leading-relaxed text-foreground">
                    {followUp.whyNow}
                  </p>
                </div>
              ) : null}

              {followUp.reason && (
                <div className="flex flex-col gap-1.5">
                  <span className="meta-label">What to do</span>
                  <p className="text-sm leading-relaxed text-foreground">
                    {followUp.reason}
                  </p>
                </div>
              )}

              {followUp.suggestedMessage && (
                <div data-padding="none" className="soft-panel flex flex-col gap-2 px-4 py-3 shadow-none">
                  <span className="meta-label">Suggested message</span>
                  <p className="text-sm leading-relaxed break-words text-foreground [overflow-wrap:anywhere]">
                    {followUp.suggestedMessage}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <FollowUpMessageCopyButton message={followUp.suggestedMessage} />
                  </div>
                </div>
              )}
            </div>

            {/* Side column */}
            <div className="flex min-w-0 flex-col gap-4">
              {followUp.quoteContext ? (
                <div className="flex flex-col gap-2">
                  <span className="meta-label">Quote context</span>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {quoteAmount ? (
                      <span className="font-medium text-foreground tabular-nums">
                        {quoteAmount}
                      </span>
                    ) : null}
                    {isQuoteStatus(followUp.quoteContext.status) &&
                    followUp.quoteContext.status !== "sent" ? (
                      <QuoteStatusBadge status={followUp.quoteContext.status} />
                    ) : null}
                    {followUp.quoteContext.viewedAt ? (
                      <Badge variant="secondary" className="rounded-full">
                        Viewed
                      </Badge>
                    ) : null}
                    {followUp.quoteContext.sentAt ? (
                      <span>Sent {formatFollowUpDate(followUp.quoteContext.sentAt, followUp.businessTimezone)}</span>
                    ) : null}
                  </div>
                  {staleLabel ? (
                    <p className="text-xs text-muted-foreground">{staleLabel}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <span className="meta-label">Linked {followUp.related.kind}</span>
                <Button asChild variant="outline" size="sm" className="justify-start">
                  <Link href={relatedHref} onClick={onClose} prefetch={true}>
                    <ArrowRight data-icon="inline-start" />
                    {followUp.related.label}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            onClick={handleSkip}
            disabled={isActioning}
            variant="outline"
            size="sm"
          >
            <OptimisticPendingIndicator pending={isActioning} />
            <SkipForward data-icon="inline-start" />
            Dismiss
          </Button>
          <Button
            onClick={handleComplete}
            disabled={isActioning}
            size="sm"
          >
            <OptimisticPendingIndicator pending={isActioning} />
            <CheckCircle2 data-icon="inline-start" />
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
