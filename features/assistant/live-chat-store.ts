"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";

import {
  historyToUIMessages,
  type AssistantHistoryRow,
} from "@/features/assistant/components/message-mapping";

/**
 * Live Assistant conversations, held outside React.
 *
 * The surface is remounted by things the chat has no say over: the notification
 * bell refreshes the route on focus and on a timer, every server action
 * re-renders the current page, and leaving for another dashboard page unmounts
 * the tree entirely. Keeping the AI SDK `Chat` in React state meant each of
 * those threw the conversation away and rebuilt it from the database — the
 * "random refresh".
 *
 * Holding it here instead makes a remount lossless (same `Chat`, same
 * transcript, same in-flight stream) and lets a conversation stay open while
 * the owner works elsewhere. Module scope is per tab, so a hard reload starts
 * clean and the server rehydrates from the database.
 *
 * Entries are keyed by user *and* business so a second sign-in on the same tab
 * can never adopt the previous owner's transcript (ADR 004).
 */

const CHAT_API = "/api/ai/assistant/chat";

/** Warm conversations to keep; the rest rehydrate from the database on demand. */
const MAX_CONVERSATIONS = 5;

export type LiveConversation = {
  readonly key: string;
  readonly userId: string;
  readonly businessSlug: string;
  /** Null until the server mints one on the first send. */
  sessionId: string | null;
  readonly chat: Chat<UIMessage>;
  /** Unsent composer text, kept per conversation. */
  draft: string;
  /** Plan-limit notice from the last 429, if any. */
  limitMessage: string | null;
  /** A `?q=` hand-off is delivered once per conversation, not once per mount. */
  autoSent: boolean;
  /** Message count already announced to the history panel. */
  announced: number;
  lastUsedAt: number;
};

const conversations = new Map<string, LiveConversation>();
/** `${scope}::${sessionId}` → conversation key, rebound when a session mints. */
const bySession = new Map<string, string>();
/** scope → the conversation the owner was last looking at. */
const byScope = new Map<string, string>();
const listeners = new Set<() => void>();

let version = 0;
let counter = 0;

function scopeOf(userId: string, businessSlug: string): string {
  return `${userId}::${businessSlug}`;
}

/**
 * Bump the store version so subscribed surfaces re-read.
 * Never called while rendering — only from events, effects, and responses.
 */
function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeToLiveChat(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLiveChatVersion(): number {
  return version;
}

function isIdle(conversation: LiveConversation): boolean {
  const status = conversation.chat.status;
  return status !== "streaming" && status !== "submitted";
}

function isUnused(conversation: LiveConversation): boolean {
  return conversation.chat.messages.length === 0 && isIdle(conversation);
}

/** Drop the coldest conversations once the cache outgrows its cap. */
function evict(): void {
  if (conversations.size <= MAX_CONVERSATIONS) return;
  const victims = [...conversations.values()]
    .filter(
      (candidate) =>
        byScope.get(scopeOf(candidate.userId, candidate.businessSlug)) !==
          candidate.key && isIdle(candidate),
    )
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);

  for (const victim of victims) {
    if (conversations.size <= MAX_CONVERSATIONS) break;
    conversations.delete(victim.key);
    if (victim.sessionId) {
      bySession.delete(
        `${scopeOf(victim.userId, victim.businessSlug)}::${victim.sessionId}`,
      );
    }
  }
}

/** Record the session the server minted, so a later mount finds this chat. */
function attachSession(conversation: LiveConversation, sessionId: string): void {
  if (conversation.sessionId === sessionId) return;
  const scope = scopeOf(conversation.userId, conversation.businessSlug);
  if (conversation.sessionId) {
    bySession.delete(`${scope}::${conversation.sessionId}`);
  }
  conversation.sessionId = sessionId;
  bySession.set(`${scope}::${sessionId}`, conversation.key);
  notify();
}

async function readLimitMessage(
  conversation: LiveConversation,
  response: Response,
): Promise<void> {
  const data = await response
    .clone()
    .json()
    .catch(() => null);
  if (!data || typeof data !== "object" || !("upgradeRequired" in data)) return;
  const error = (data as { error?: unknown }).error;
  conversation.limitMessage =
    typeof error === "string" && error.trim()
      ? error
      : "You've reached your Assistant message limit.";
  notify();
}

function createConversation({
  userId,
  businessSlug,
  sessionId,
  messages,
  store,
}: {
  userId: string;
  businessSlug: string;
  sessionId: string | null;
  messages: UIMessage[];
  store: boolean;
}): LiveConversation {
  counter += 1;
  const scope = scopeOf(userId, businessSlug);
  const key = `${scope}::${sessionId ?? `draft-${counter}`}`;
  // The transport outlives every mount, so the response hooks read the
  // conversation from a holder rather than closing over React state.
  const holder: { conversation: LiveConversation | null } = {
    conversation: null,
  };

  const chat = new Chat<UIMessage>({
    id: key,
    messages,
    transport: new DefaultChatTransport({
      api: CHAT_API,
      // Headers are invisible to the transport's callers, so the minted session
      // id and the plan-limit payload are both read here.
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        const conversation = holder.conversation;
        if (conversation) {
          const minted = response.headers.get("X-Session-Id");
          if (minted) attachSession(conversation, minted);
          if (response.status === 429) {
            await readLimitMessage(conversation, response);
          }
        }
        return response;
      },
    }),
  });

  const conversation: LiveConversation = {
    key,
    userId,
    businessSlug,
    sessionId: sessionId ?? null,
    chat,
    draft: "",
    limitMessage: null,
    autoSent: false,
    // Rehydrated history is already in the panel; only new turns are announced.
    announced: messages.length,
    lastUsedAt: Date.now(),
  };
  holder.conversation = conversation;

  if (store) {
    conversations.set(key, conversation);
    if (sessionId) bySession.set(`${scope}::${sessionId}`, key);
    byScope.set(scope, key);
    evict();
  }

  return conversation;
}

function adopt(conversation: LiveConversation): LiveConversation {
  conversation.lastUsedAt = Date.now();
  byScope.set(scopeOf(conversation.userId, conversation.businessSlug), conversation.key);
  return conversation;
}

/**
 * Find the conversation a mount should show, creating one when needed.
 *
 * Resolution order:
 * 1. the session in the URL, if that conversation is already live (this is what
 *    keeps an in-flight stream alive across a remount);
 * 2. otherwise that session, rebuilt from the server-rendered history;
 * 3. with no session in the URL, whatever the owner was last looking at in this
 *    business — the reason returning through the sidebar reopens the chat;
 * 4. failing all of that, a fresh conversation.
 *
 * Safe to call while rendering: it never notifies subscribers. On the server it
 * returns an unstored conversation, because module scope there is shared
 * between requests.
 */
export function resolveLiveConversation({
  userId,
  businessSlug,
  sessionId,
  preferNew,
  history,
}: {
  userId: string;
  businessSlug: string;
  sessionId: string | null;
  /** A `?q=` hand-off wants a clean conversation, not the last one. */
  preferNew?: boolean;
  history: () => AssistantHistoryRow[];
}): LiveConversation {
  const store = typeof window !== "undefined";
  const scope = scopeOf(userId, businessSlug);

  if (store && sessionId) {
    const live = conversations.get(bySession.get(`${scope}::${sessionId}`) ?? "");
    if (live) return adopt(live);
  }

  if (store && !sessionId) {
    const active = conversations.get(byScope.get(scope) ?? "");
    // An empty conversation is indistinguishable from a new one, so reusing it
    // keeps `?q=` from stacking up throwaway chats (React 19 renders twice in
    // development).
    if (active && (!preferNew || isUnused(active))) return adopt(active);
  }

  return createConversation({
    userId,
    businessSlug,
    sessionId,
    messages: sessionId ? historyToUIMessages(history()) : [],
    store,
  });
}

/** Start a conversation the owner asked for explicitly ("New chat"). */
export function startNewConversation({
  userId,
  businessSlug,
}: {
  userId: string;
  businessSlug: string;
}): LiveConversation {
  return createConversation({
    userId,
    businessSlug,
    sessionId: null,
    messages: [],
    store: typeof window !== "undefined",
  });
}

/** Re-read a conversation by key so React sees the latest store values. */
export function getLiveConversation(key: string): LiveConversation | null {
  return conversations.get(key) ?? null;
}

export function setConversationDraft(key: string, draft: string): void {
  const conversation = conversations.get(key);
  if (!conversation || conversation.draft === draft) return;
  conversation.draft = draft;
  notify();
}

export function setConversationLimitMessage(
  key: string,
  limitMessage: string | null,
): void {
  const conversation = conversations.get(key);
  if (!conversation || conversation.limitMessage === limitMessage) return;
  conversation.limitMessage = limitMessage;
  notify();
}

export function markConversationAnnounced(key: string, count: number): void {
  const conversation = conversations.get(key);
  if (conversation) conversation.announced = count;
}

export function markConversationAutoSent(key: string): void {
  const conversation = conversations.get(key);
  if (conversation) conversation.autoSent = true;
}

/**
 * Forget a conversation whose session was deleted, so it cannot come back as
 * the business's last-active chat. Matched on the session rather than the
 * scope, so callers do not have to know which user owns it.
 */
export function forgetLiveConversation({
  businessSlug,
  sessionId,
}: {
  businessSlug: string;
  sessionId: string;
}): void {
  let forgot = false;

  for (const conversation of [...conversations.values()]) {
    if (
      conversation.businessSlug !== businessSlug ||
      conversation.sessionId !== sessionId
    ) {
      continue;
    }
    const scope = scopeOf(conversation.userId, businessSlug);
    conversations.delete(conversation.key);
    bySession.delete(`${scope}::${sessionId}`);
    if (byScope.get(scope) === conversation.key) byScope.delete(scope);
    forgot = true;
  }

  if (forgot) notify();
}
