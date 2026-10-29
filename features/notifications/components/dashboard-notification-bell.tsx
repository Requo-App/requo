"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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

import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { useProgressRouter } from "@/hooks/use-progress-router";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
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
import {
  getBusinessHomePath,
  getBusinessInquiryPath,
  getBusinessNotificationsPath,
  getBusinessQuotePath,
} from "@/features/businesses/routes";
import { cn } from "@/lib/utils";

type DashboardNotificationBellProps = {
  businessId: string;
  businessSlug: string;
  initialView: BusinessNotificationBellView;
  userId: string;
};

type RealtimeNotificationRow = {
  id: string;
  inquiry_id: string | null;
  quote_id: string | null;
  summary: string;
  title: string;
  type: BusinessNotificationType;
  created_at: string;
};

type RealtimeNotificationStateRow = {
  last_read_at: string | null;
};

type RealtimeInquiryRow = {
  id: string;
};

type SupabaseBrowserClient = ReturnType<
  typeof import("@/lib/supabase/browser").createSupabaseBrowserClient
>;
type RealtimeChannel = ReturnType<SupabaseBrowserClient["channel"]>;

let realtimeChannelSequence = 0;

function createRealtimeChannelId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  realtimeChannelSequence += 1;
  return `${Date.now().toString(36)}-${realtimeChannelSequence.toString(36)}`;
}

export function DashboardNotificationBell({
  businessId,
  businessSlug,
  initialView,
  userId,
}: DashboardNotificationBellProps) {
  const isMobile = useIsMobile();
  const progressRouter = useProgressRouter();
  const { scheduleRefresh } = useDeferredRefresh();
  const supabaseRef = useRef<SupabaseBrowserClient | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, startLoadMore] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [shouldConnectRealtime, setShouldConnectRealtime] = useState(false);
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

  useEffect(() => {
    // Delay realtime connection until after initial paint + hydration settles.
    // The server-rendered `initialView` is the source of truth for the first
    // ~1.5s. Notifications emitted in this brief window will be picked up by
    // the fallback visibility-change refresh below.
    if (shouldConnectRealtime) {
      return;
    }

    const id = window.requestIdleCallback
      ? window.requestIdleCallback(() => setShouldConnectRealtime(true), { timeout: 1800 })
      : window.setTimeout(() => setShouldConnectRealtime(true), 1200);

    return () => {
      if (window.cancelIdleCallback) {
        window.cancelIdleCallback(id as number);
      } else {
        window.clearTimeout(id as number);
      }
    };
  }, [shouldConnectRealtime]);

  useEffect(() => {
    if (!shouldConnectRealtime) {
      return;
    }

    let isActive = true;
    // Supabase reuses channels by topic and `removeChannel()` is async, so a
    // remount can observe the previous run's still-subscribed channel. A
    // unique topic per effect run keeps listener registration independent.
    const channelId = createRealtimeChannelId();
    let notificationChannel: RealtimeChannel | null = null;
    let stateChannel: RealtimeChannel | null = null;
    let inquiryChannel: RealtimeChannel | null = null;

    function clearRefreshTimer() {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    }

    function scheduleTokenRefresh(expiresAt: string) {
      clearRefreshTimer();

      const refreshInMs = Math.max(
        new Date(expiresAt).getTime() - Date.now() - 60_000,
        30_000,
      );

      refreshTimerRef.current = window.setTimeout(() => {
        void refreshRealtimeAuth();
      }, refreshInMs);
    }

    async function fetchRealtimeToken() {
      const response = await fetch("/api/business/notifications/realtime-token", {
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as {
        expiresAt: string;
        token: string;
      };
    }

    async function getSupabase() {
      if (supabaseRef.current) {
        return supabaseRef.current;
      }

      const { createSupabaseBrowserClient } = await import(
        "@/lib/supabase/browser"
      );
      const nextClient = createSupabaseBrowserClient();
      supabaseRef.current = nextClient;
      return nextClient;
    }

    async function refreshRealtimeAuth() {
      const nextToken = await fetchRealtimeToken();

      if (!nextToken || !isActive) {
        return;
      }

      const supabase = await getSupabase();

      if (!isActive) {
        return;
      }

      await supabase.realtime.setAuth(nextToken.token);
      scheduleTokenRefresh(nextToken.expiresAt);
    }

    async function connectRealtime() {
      const nextToken = await fetchRealtimeToken();

      if (!nextToken || !isActive) {
        return;
      }

      const supabase = await getSupabase();

      if (!isActive) {
        return;
      }

      await supabase.realtime.setAuth(nextToken.token);

      // The effect may have been cleaned up while setAuth was in flight. Do not
      // create channels that the cleanup has already passed.
      if (!isActive) {
        return;
      }

      const handleRealtimeNotification = (row: RealtimeNotificationRow) => {
        setView((currentView) => {
          if (currentView.items.some((item) => item.id === row.id)) {
            return currentView;
          }

          const unread = isNotificationUnread(
            row.created_at,
            currentView.lastReadAt,
          );
          const nextItem: BusinessNotificationItem = {
            id: row.id,
            type: row.type,
            title: row.title,
            summary: row.summary,
            href: row.quote_id
              ? getBusinessQuotePath(businessSlug, row.quote_id)
              : row.inquiry_id
                ? getBusinessInquiryPath(businessSlug, row.inquiry_id)
                : getBusinessHomePath(businessSlug),
            createdAt: row.created_at,
            unread,
          };

          return {
            items: [nextItem, ...currentView.items],
            unreadCount: currentView.unreadCount + (unread ? 1 : 0),
            lastReadAt: currentView.lastReadAt,
            hasMore: currentView.hasMore,
          };
        });

        scheduleRefresh();
      };

      const handleRealtimeState = (row: RealtimeNotificationStateRow) => {
        if (!row.last_read_at) {
          return;
        }

        applyReadWatermark(row.last_read_at);
      };

      const handleSubscribeStatus = (label: string) => (status: string) => {
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          // Surface subscription failures so they are not silent. When these
          // fire, the fallback polling + visibility refresh below still keeps
          // the bell accurate — realtime just won't be instant.
          console.warn(
            `[notifications] realtime channel "${label}" ${status}`,
          );
        }
      };

      notificationChannel = supabase
        .channel(`business-notifications:${businessId}:${userId}:${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            filter: `business_id=eq.${businessId}`,
            schema: "public",
            table: "business_notifications",
          },
          (payload) => {
            handleRealtimeNotification(payload.new as RealtimeNotificationRow);
          },
        )
        .subscribe(handleSubscribeStatus("business_notifications"));

      stateChannel = supabase
        .channel(`business-notification-states:${businessId}:${userId}:${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            filter: `business_id=eq.${businessId}`,
            schema: "public",
            table: "business_notification_states",
          },
          (payload) => {
            handleRealtimeState(payload.new as RealtimeNotificationStateRow);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            filter: `business_id=eq.${businessId}`,
            schema: "public",
            table: "business_notification_states",
          },
          (payload) => {
            handleRealtimeState(payload.new as RealtimeNotificationStateRow);
          },
        )
        .subscribe(handleSubscribeStatus("business_notification_states"));

      inquiryChannel = supabase
        .channel(`business-inquiries:${businessId}:${userId}:${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            filter: `business_id=eq.${businessId}`,
            schema: "public",
            table: "inquiries",
          },
          (payload) => {
            const row = payload.new as RealtimeInquiryRow;

            if (row.id) {
              scheduleRefresh();
            }
          },
        )
        .subscribe(handleSubscribeStatus("inquiries"));

      scheduleTokenRefresh(nextToken.expiresAt);
    }

    void connectRealtime().catch((error) => {
      if (isActive) {
        console.warn("[notifications] realtime connection failed", error);
      }
    });

    return () => {
      isActive = false;
      clearRefreshTimer();
      const supabase = supabaseRef.current;

      if (supabase && notificationChannel) {
        void supabase.removeChannel(notificationChannel);
      }

      if (supabase && stateChannel) {
        void supabase.removeChannel(stateChannel);
      }

      if (supabase && inquiryChannel) {
        void supabase.removeChannel(inquiryChannel);
      }
    };
  }, [businessId, businessSlug, scheduleRefresh, shouldConnectRealtime, userId]);

  // Fallback refresh: if realtime is not configured, rejected, or degraded
  // (bad JWT, missing publication, RLS blocking events, flaky connection),
  // the bell must still pick up new notifications within a reasonable window.
  // We soft-refresh the route on tab visibility change and on a slow interval.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const POLL_INTERVAL_MS = 45_000;
    let lastRefreshAt = Date.now();

    const maybeRefresh = () => {
      // Debounce so we don't spam refresh when realtime is also active.
      if (Date.now() - lastRefreshAt < 5_000) {
        return;
      }

      lastRefreshAt = Date.now();
      scheduleRefresh();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    };

    const handleFocus = () => {
      maybeRefresh();
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        maybeRefresh();
      }
    }, POLL_INTERVAL_MS);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
    };
  }, [scheduleRefresh]);

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

    const thresholdPx = 80;
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
        scheduleRefresh();
        return;
      }

      applyReadWatermark(result.lastReadAt);
    });
  }

  function openNotification(item: BusinessNotificationItem) {
    setIsOpen(false);

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

    progressRouter.push(item.href);
  }

  const trigger = (
    <Button
      aria-label={
        view.unreadCount
          ? `${view.unreadCount} unread notifications`
          : "Notifications"
      }
      className="relative"
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Bell className="size-4" />
      {view.unreadCount ? (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-xs font-semibold leading-none text-background shadow-sm">
          {view.unreadCount > 99 ? "99+" : view.unreadCount}
        </span>
      ) : null}
    </Button>
  );

  const notificationContent = (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <p className="text-xs text-muted-foreground">
            {view.unreadCount
              ? `${view.unreadCount} unread in this business`
              : "You're all caught up"}
          </p>
        </div>
        <Button
          disabled={!view.unreadCount || isPending}
          onClick={markAllRead}
          size="sm"
          type="button"
          variant="ghost"
        >
          <CheckCheck data-icon="inline-start" />
          Mark all read
        </Button>
      </div>
      <Separator />
      <div
        ref={scrollViewportRef}
        className={cn(
          "overscroll-contain",
          isMobile
            ? // The sheet body owns the height; this is the only scroll
              // container on mobile, so drop the nested max-height viewport.
              "min-h-0 flex-1 overflow-y-auto"
            : "max-h-[min(26rem,calc(100dvh-11rem))] overflow-y-auto sm:max-h-[26rem]",
        )}
        onScroll={handleNotificationScroll}
      >
        {view.items.length ? (
          <div className="flex flex-col p-2">
            {view.items.map((item) => {
              const Icon = getNotificationIcon(item.type);

              return (
                <button
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent/45",
                    item.unread ? "bg-accent/20" : "bg-transparent",
                  )}
                  key={item.id}
                  onClick={() => openNotification(item)}
                  type="button"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted text-muted-foreground",
                      item.unread && "border-primary/15 bg-primary/8 text-primary-ink",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <p
                        className={cn(
                          "min-w-0 break-words text-sm leading-5 text-foreground",
                          item.unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {item.title}
                      </p>
                      {isMobile ? (
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          {formatRelativeNotificationTime(item.createdAt)}
                        </span>
                      ) : (
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
                      )}
                    </div>
                    <p className="mt-1 break-words text-sm leading-5 text-muted-foreground">
                      {item.summary}
                    </p>
                  </div>
                </button>
              );
            })}
            {view.hasMore ? (
              <div className="flex justify-center py-3">
                {isLoadingMore ? (
                  <span className="text-xs text-muted-foreground">Loading…</span>
                ) : (
                  <span className="sr-only">Scroll for more</span>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="p-4">
            <Empty className="min-h-56 border-none bg-transparent p-6 shadow-none">
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
          </div>
        )}
      </div>
      <Separator />
      <div className="px-4 py-3">
        <Button
          asChild
          className="w-full"
          onClick={() => setIsOpen(false)}
          size="sm"
          variant="ghost"
        >
          <Link href={getBusinessNotificationsPath(businessSlug)}>
            View all notifications
          </Link>
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          className="data-[side=bottom]:h-[min(34rem,calc(100dvh-0.75rem))] rounded-t-2xl"
          side="bottom"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          <SheetBody className="gap-0 overflow-hidden p-0">
            {notificationContent}
          </SheetBody>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover modal={false} onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(25rem,calc(100vw-1.5rem))] rounded-2xl p-0"
        sideOffset={10}
      >
        {notificationContent}
      </PopoverContent>
    </Popover>
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
