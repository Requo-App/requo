"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import {
  Bell,
  CheckCheck,
  CircleCheckBig,
  CircleX,
  Edit,
  Inbox,
  MailPlus,
  UserCheck,
  UserX,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  loadMoreBusinessNotificationsAction,
  markBusinessNotificationReadAction,
  markBusinessNotificationsReadAction,
} from "@/features/notifications/actions";
import type {
  BusinessNotificationBellView,
  BusinessNotificationItem,
  BusinessNotificationType,
} from "@/features/notifications/types";
import {
  formatNotificationDateTime,
  formatRelativeNotificationTime,
  isNotificationUnread,
} from "@/features/notifications/utils";
import { cn } from "@/lib/utils";

type NotificationsListProps = {
  businessSlug: string;
  initialView: BusinessNotificationBellView;
};

export function NotificationsList({
  businessSlug,
  initialView,
}: NotificationsListProps) {
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, startLoadMore] = useTransition();
  const [view, setView] = useState({
    ...initialView,
    hasMore: initialView.hasMore ?? false,
  });
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const loadMoreInFlightRef = useRef(false);

  function applyReadWatermark(nextLastReadAt: string) {
    setView((currentView) => {
      const items = currentView.items.map((item) => ({
        ...item,
        unread: isNotificationUnread(item.createdAt, nextLastReadAt),
      }));

      return {
        items,
        unreadCount: items.filter((item) => item.unread).length,
        lastReadAt: nextLastReadAt,
        hasMore: currentView.hasMore,
      };
    });
  }

  function markSingleNotificationRead(itemId: string) {
    setView((currentView) => {
      let didUpdate = false;
      const items = currentView.items.map((item) => {
        if (item.id !== itemId || !item.unread) {
          return item;
        }

        didUpdate = true;
        return { ...item, unread: false };
      });

      if (!didUpdate) {
        return currentView;
      }

      return {
        ...currentView,
        items,
        unreadCount: Math.max(0, currentView.unreadCount - 1),
        hasMore: currentView.hasMore,
      };
    });
  }

  const loadOlderNotifications = useCallback(() => {
    if (!view.hasMore || loadMoreInFlightRef.current || isLoadingMore) {
      return;
    }

    const oldest = view.items[view.items.length - 1];

    if (!oldest) {
      return;
    }

    loadMoreInFlightRef.current = true;

    startLoadMore(async () => {
      const result = await loadMoreBusinessNotificationsAction(
        businessSlug,
        oldest.createdAt,
        oldest.id,
        view.lastReadAt,
      );

      loadMoreInFlightRef.current = false;

      if (!result.ok) {
        console.error(result.error);
        return;
      }

      setView((current) => {
        const existingIds = new Set(current.items.map((item) => item.id));
        const merged = [
          ...current.items,
          ...result.items.filter((item) => !existingIds.has(item.id)),
        ];

        return {
          ...current,
          items: merged,
          hasMore: result.hasMore,
        };
      });
    });
  }, [
    businessSlug,
    isLoadingMore,
    view.hasMore,
    view.items,
    view.lastReadAt,
  ]);

  function handleNotificationScroll() {
    const el = scrollViewportRef.current;

    if (!el || !view.hasMore || loadMoreInFlightRef.current || isLoadingMore) {
      return;
    }

    const thresholdPx = 200;
    const nearBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - thresholdPx;

    if (nearBottom) {
      loadOlderNotifications();
    }
  }

  function markAllRead() {
    const newestNotification = view.items[0];

    if (!newestNotification) {
      return;
    }

    const previousView = view;

    applyReadWatermark(newestNotification.createdAt);

    startTransition(async () => {
      const result = await markBusinessNotificationsReadAction(
        businessSlug,
        newestNotification.createdAt,
      );

      if (!result.ok) {
        console.error(result.error);
        setView(previousView);
        return;
      }

      applyReadWatermark(result.lastReadAt);
    });
  }

  function handleNotificationClick(item: BusinessNotificationItem) {
    if (item.unread) {
      const previousView = view;
      markSingleNotificationRead(item.id);

      startTransition(async () => {
        const result = await markBusinessNotificationReadAction(
          businessSlug,
          item.id,
        );

        if (!result.ok) {
          console.error(result.error);
          setView(previousView);
        }
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {view.unreadCount
              ? `${view.unreadCount} unread notification${view.unreadCount === 1 ? "" : "s"}`
              : "You're all caught up"}
          </p>
        </div>
        <Button
          disabled={!view.unreadCount || isPending}
          onClick={markAllRead}
          size="sm"
          variant="outline"
        >
          <CheckCheck data-icon="inline-start" />
          Mark all read
        </Button>
      </div>

      <Separator />

      {/* Notifications List */}
      <div
        ref={scrollViewportRef}
        className="flex flex-col gap-2"
        onScroll={handleNotificationScroll}
      >
        {view.items.length ? (
          <>
            {view.items.map((item) => {
              const Icon = getNotificationIcon(item.type);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => handleNotificationClick(item)}
                  className={cn(
                    "flex w-full items-start gap-4 rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-border hover:bg-accent/30",
                    item.unread && "border-primary/20 bg-primary/5",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground",
                      item.unread && "border-primary/20 bg-primary/10 text-primary-ink",
                    )}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <p
                        className={cn(
                          "min-w-0 break-words text-base leading-6 text-foreground",
                          item.unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {item.title}
                      </p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="shrink-0 text-xs font-medium text-muted-foreground"
                          >
                            {formatRelativeNotificationTime(item.createdAt)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{formatNotificationDateTime(item.createdAt)}</TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="mt-1.5 break-words text-sm leading-6 text-muted-foreground">
                      {item.summary}
                    </p>
                  </div>
                </Link>
              );
            })}
            {view.hasMore ? (
              <div className="flex justify-center py-6">
                <Button
                  disabled={isLoadingMore}
                  onClick={loadOlderNotifications}
                  size="sm"
                  variant="outline"
                >
                  {isLoadingMore ? (
                    <>
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                      Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex justify-center py-6">
                <p className="text-xs text-muted-foreground">No more notifications</p>
              </div>
            )}
          </>
        ) : (
          <Empty className="min-h-96 border-border/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>No notifications yet</EmptyTitle>
              <EmptyDescription>
                New inquiries, quote responses, and follow-up activity will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </div>
  );
}

function getNotificationIcon(type: BusinessNotificationType) {
  switch (type) {
    case "public_inquiry_submitted":
      return MailPlus;
    case "quote_customer_accepted":
      return CircleCheckBig;
    case "quote_customer_rejected":
      return CircleX;
    case "quote_revision_requested":
      return Edit;
    case "business_member_invite_accepted":
      return UserCheck;
    case "business_member_invite_declined":
      return UserX;
    default:
      return Bell;
  }
}
