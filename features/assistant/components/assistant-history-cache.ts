"use client";

export type AssistantHistoryCachedItem = {
  id: string;
  title: string | null;
  lastMessageAt: string;
  createdAt: string;
};

type CachedHistoryEntry = {
  items: AssistantHistoryCachedItem[];
  total: number;
};

export const ASSISTANT_HISTORY_CHANGED_EVENT = "assistant:history-changed";

/**
 * Module-level history cache, keyed by member and business.
 *
 * The history list lives inside a popover/sheet that unmounts when closed, so
 * every open rebuilt from an empty list and flashed a skeleton. Keeping the
 * last first-page result here lets the next open render instantly
 * (stale-while-revalidate): cached rows paint immediately while a silent
 * background fetch brings titles and ordering up to date.
 *
 * The key includes the member id. The cache is per tab, and a shared or
 * kiosk tab outlives a sign-out: keyed by business alone, the next member to
 * sign in was painted the previous member's conversation titles — and a
 * title is the first user message.
 *
 * Module scope is per tab, matching the live-chat store. Entries are replaced
 * (not merged) on a first-page fetch so server-side deletions from another
 * tab disappear; `loadMore` appends.
 */
const cache = new Map<string, CachedHistoryEntry>();

function keyOf(userId: string, businessSlug: string): string {
  return `${userId}:${businessSlug}`;
}

export function getCachedAssistantHistory(
  userId: string,
  businessSlug: string,
): CachedHistoryEntry | null {
  return cache.get(keyOf(userId, businessSlug)) ?? null;
}

export function setCachedAssistantHistory(
  userId: string,
  businessSlug: string,
  items: AssistantHistoryCachedItem[],
  total: number,
): void {
  cache.set(keyOf(userId, businessSlug), { items, total });
}

export function appendCachedAssistantHistory(
  userId: string,
  businessSlug: string,
  items: AssistantHistoryCachedItem[],
  total: number,
): void {
  const key = keyOf(userId, businessSlug);
  const prev = cache.get(key);
  if (!prev) {
    cache.set(key, { items, total });
    return;
  }
  const seen = new Set(prev.items.map((item) => item.id));
  const merged = [
    ...prev.items,
    ...items.filter((item) => !seen.has(item.id)),
  ];
  cache.set(key, { items: merged, total });
}

export function patchCachedAssistantHistoryTitle(
  userId: string,
  businessSlug: string,
  sessionId: string,
  title: string,
): void {
  const entry = cache.get(keyOf(userId, businessSlug));
  if (!entry) return;
  cache.set(keyOf(userId, businessSlug), {
    ...entry,
    items: entry.items.map((item) =>
      item.id === sessionId ? { ...item, title } : item,
    ),
  });
}

export function removeCachedAssistantHistory(
  userId: string,
  businessSlug: string,
  sessionId: string,
): void {
  const entry = cache.get(keyOf(userId, businessSlug));
  if (!entry) return;
  cache.set(keyOf(userId, businessSlug), {
    items: entry.items.filter((item) => item.id !== sessionId),
    total: Math.max(0, entry.total - 1),
  });
}

export function clearAssistantHistoryCache(
  userId?: string,
  businessSlug?: string,
): void {
  if (userId && businessSlug) {
    cache.delete(keyOf(userId, businessSlug));
    return;
  }
  cache.clear();
}

/** Shallow compare so a background revalidate that changed nothing skips a render. */
export function assistantHistoriesEqual(
  a: AssistantHistoryCachedItem[],
  b: AssistantHistoryCachedItem[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, index) =>
      item.id === b[index].id && item.title === b[index].title,
  );
}

export function notifyAssistantHistoryChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ASSISTANT_HISTORY_CHANGED_EVENT));
}
