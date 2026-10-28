"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, MessageSquareDashed, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { getBusinessAssistantPath } from "@/features/businesses/routes";
import {
  deleteAssistantSessionAction,
  listAssistantSessionsAction,
  renameAssistantSessionAction,
} from "@/features/assistant/actions";
import {
  ASSISTANT_HISTORY_CHANGED_EVENT,
  appendCachedAssistantHistory,
  assistantHistoriesEqual,
  getCachedAssistantHistory,
  patchCachedAssistantHistoryTitle,
  removeCachedAssistantHistory,
  setCachedAssistantHistory,
} from "@/features/assistant/components/assistant-history-cache";
import { forgetLiveConversation } from "@/features/assistant/live-chat-store";

type HistoryItem = {
  id: string;
  title: string | null;
  lastMessageAt: string;
  createdAt: string;
};

const PAGE_SIZE = 20;

/**
 * Conversation history for the Assistant, opened from a button in the chat
 * header. Mirrors the notification bell: a popover on desktop, a bottom sheet
 * on mobile.
 */
export function AssistantHistoryPanel({
  businessSlug,
  activeSessionId,
  userId,
}: {
  businessSlug: string;
  activeSessionId?: string | null;
  /** The signed-in member: the cache is scoped per member, not per business. */
  userId: string;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  // Keep the cache warm while the panel is closed, so the next open paints
  // instantly with fresh titles and ordering. The open list fetches for
  // itself; this only covers the closed state to avoid a double fetch.
  useEffect(() => {
    if (open) return;
    const warm = async () => {
      const result = await listAssistantSessionsAction({
        businessSlug,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if ("error" in result) return;
      setCachedAssistantHistory(userId, businessSlug, result.sessions, result.total);
    };
    window.addEventListener(ASSISTANT_HISTORY_CHANGED_EVENT, warm);
    return () => {
      window.removeEventListener(ASSISTANT_HISTORY_CHANGED_EVENT, warm);
    };
  }, [businessSlug, open, userId]);

  const trigger = (
    <Button
      aria-label="Open conversation history"
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <History className="size-4" />
    </Button>
  );

  const content = (
    <HistoryList
      businessSlug={businessSlug}
      activeSessionId={activeSessionId}
      userId={userId}
      open={open}
      onNavigate={() => setOpen(false)}
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          className="h-[min(34rem,calc(100dvh-0.75rem))] rounded-t-2xl"
          side="bottom"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Conversations</SheetTitle>
            <SheetDescription>
              Open, rename, or delete a saved conversation.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="gap-0 p-0">{content}</SheetBody>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover modal={false} onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(23rem,calc(100vw-1.5rem))] rounded-2xl p-0"
        sideOffset={10}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

function HistoryList({
  businessSlug,
  activeSessionId,
  open,
  onNavigate,
  userId,
}: {
  businessSlug: string;
  activeSessionId?: string | null;
  open: boolean;
  onNavigate: () => void;
  userId: string;
}) {
  const router = useRouter();
  // Seed from the module cache so a reopen paints instantly; the skeleton
  // only shows on a cold first open with nothing cached.
  const [items, setItems] = useState<HistoryItem[]>(
    () => getCachedAssistantHistory(userId, businessSlug)?.items ?? [],
  );
  const [total, setTotal] = useState(
    () => getCachedAssistantHistory(userId, businessSlug)?.total ?? 0,
  );
  const [loading, setLoading] = useState(
    () => getCachedAssistantHistory(userId, businessSlug) == null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyResult = useCallback(
    (
      result: Awaited<ReturnType<typeof listAssistantSessionsAction>>,
      append: boolean,
    ) => {
      if ("error" in result) {
        setError(result.error);
      } else {
        setError(null);
        if (append) {
          appendCachedAssistantHistory(
            userId,
            businessSlug,
            result.sessions,
            result.total,
          );
          setItems((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            return [
              ...prev,
              ...result.sessions.filter((item) => !seen.has(item.id)),
            ];
          });
        } else {
          setCachedAssistantHistory(
            userId,
            businessSlug,
            result.sessions,
            result.total,
          );
          // A silent background revalidate that changed nothing keeps the
          // cached rows as-is instead of flashing the list.
          setItems((prev) =>
            assistantHistoriesEqual(prev, result.sessions)
              ? prev
              : result.sessions,
          );
        }
        setTotal(result.total);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [businessSlug, userId],
  );

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const result = await listAssistantSessionsAction({
      businessSlug,
      limit: PAGE_SIZE,
      offset: items.length,
    });
    applyResult(result, true);
  }, [businessSlug, items.length, applyResult]);

  // Refresh when the panel opens, and whenever a turn completes so titles and
  // ordering stay current without a page reload. The list seeds from the
  // module cache in `useState` above, so a warm reopen paints instantly and
  // this fetch is a silent revalidate — no skeleton. State updates happen in
  // the async callback below, never synchronously in the effect body.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refresh = async () => {
      const result = await listAssistantSessionsAction({
        businessSlug,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (!cancelled) {
        applyResult(result, false);
      }
    };
    void refresh();
    window.addEventListener(ASSISTANT_HISTORY_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ASSISTANT_HISTORY_CHANGED_EVENT, refresh);
    };
  }, [businessSlug, activeSessionId, applyResult, open]);

  const hasMore = items.length < total;

  const handleRename = async (id: string) => {
    const value = editValue.trim();
    if (!value) {
      setEditingId(null);
      return;
    }
    const result = await renameAssistantSessionAction({
      businessSlug,
      sessionId: id,
      title: value,
    });
    if (!("error" in result)) {
      patchCachedAssistantHistoryTitle(userId, businessSlug, id, value);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, title: value } : item)),
      );
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    const result = await deleteAssistantSessionAction({
      businessSlug,
      sessionId: id,
    });
    setDeletingId(null);
    if (!("error" in result)) {
      removeCachedAssistantHistory(userId, businessSlug, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      // Drop the live copy too, or the deleted conversation would come straight
      // back as this business's last-active chat.
      forgetLiveConversation({ businessSlug, sessionId: id });
      if (id === activeSessionId) {
        router.push(getBusinessAssistantPath(businessSlug));
      }
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Conversations</p>
          <p className="text-xs text-muted-foreground">
            {total
              ? `${total} saved ${total === 1 ? "conversation" : "conversations"}`
              : "Your past chats appear here"}
          </p>
        </div>
      </div>
      <Separator />
      <div
        aria-label="Past conversations"
        className="max-h-[min(26rem,calc(100dvh-11rem))] overflow-y-auto overscroll-contain p-2 sm:max-h-[26rem]"
        role="list"
      >
        {loading ? (
          <div
            aria-label="Loading conversations"
            className="flex flex-col gap-2 p-1"
          >
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="p-2 text-sm text-destructive-ink">{error}</p>
        ) : items.length === 0 ? (
          <Empty className="min-h-48 border-none bg-transparent p-6 shadow-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareDashed />
              </EmptyMedia>
              <EmptyTitle>No conversations yet</EmptyTitle>
              <EmptyDescription>
                Ask about your inquiries or quotes and the chat is saved here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const isActive = item.id === activeSessionId;
              const isEditing = editingId === item.id;
              const isConfirmingDelete = deletingId === item.id;
              return (
                <li key={item.id} role="listitem">
                  {isEditing ? (
                    <form
                      className="flex items-center gap-1 p-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleRename(item.id);
                      }}
                    >
                      <Input
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        className="h-8 text-sm"
                        maxLength={80}
                        autoFocus
                        aria-label="Conversation title"
                      />
                      <Button type="submit" size="sm" className="h-8">
                        Save
                      </Button>
                    </form>
                  ) : (
                    <div
                      className={cn(
                        "group flex items-center gap-1 rounded-xl px-2 py-2 transition-colors hover:bg-accent/45",
                        isActive && "bg-accent/25",
                      )}
                    >
                      <Link
                        href={`${getBusinessAssistantPath(businessSlug)}?session=${item.id}`}
                        onClick={onNavigate}
                        className="min-w-0 flex-1"
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span className="block truncate text-sm font-medium">
                          {item.title ?? "New conversation"}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(item.lastMessageAt).toLocaleDateString(
                            undefined,
                            { month: "short", day: "numeric" },
                          )}
                        </span>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditValue(item.title ?? "");
                        }}
                        aria-label={`Rename conversation ${item.title ?? ""}`}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      {isConfirmingDelete ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 shrink-0"
                          onClick={() => void handleDelete(item.id)}
                        >
                          Confirm
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => setDeletingId(item.id)}
                          onBlur={() => setDeletingId(null)}
                          aria-label={`Delete conversation ${item.title ?? ""}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !loading && (
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore
                ? "Loading…"
                : `Show more (${total - items.length} remaining)`}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
