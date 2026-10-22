"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useChat } from "@ai-sdk/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { MessageSquarePlus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MobileHeaderSlot, mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { ChatComposer } from "@/components/shared/chat/chat-composer";
import {
  AttachmentChips,
  AttachmentPickerButton,
} from "@/components/shared/chat/chat-attachment-picker";
import {
  collapseAttachmentBlocksForDisplay,
  readFilesAsDataAttachments,
} from "@/components/shared/chat/attachment-text";
import { ChatJumpToLatest } from "@/components/shared/chat/chat-jump-to-latest";
import { ChatMarkdown } from "@/components/shared/chat/chat-markdown";
import { ChatStatusLine } from "@/components/shared/chat/chat-status-line";
import { CopyButton } from "@/components/shared/chat/copy-button";
import { toast } from "@/components/shared/notify";
import { useChatScroll } from "@/components/shared/chat/use-chat-scroll";
import {
  ToolProcessDisclosure,
  type ToolStep,
} from "@/components/shared/chat/tool-process-disclosure";
import { getBusinessAssistantPath } from "@/features/businesses/routes";
import type { BusinessPlan } from "@/lib/plans/plans";
import { cn } from "@/lib/utils";
import { AssistantHistoryPanel } from "@/features/owner-assistant/components/assistant-history-panel";
import {
  ASSISTANT_HISTORY_CHANGED_EVENT,
  getCachedAssistantHistory,
  notifyAssistantHistoryChanged,
} from "@/features/owner-assistant/components/assistant-history-cache";
import { ToolResultRenderer } from "@/features/owner-assistant/components/tool-result-cards";
import {
  confirmAssistantToolAction,
  listAssistantSessionsAction,
} from "@/features/owner-assistant/actions";
import { UpgradePrompt } from "@/features/paywall/components/upgrade-prompt";
import {
  historyToUIMessages,
  type AssistantHistoryRow,
} from "@/features/owner-assistant/components/message-mapping";
import {
  getLiveChatVersion,
  markConversationAnnounced,
  markConversationAutoSent,
  resolveLiveConversation,
  setConversationDraft,
  setConversationLimitMessage,
  startNewConversation,
  subscribeToLiveChat,
} from "@/features/owner-assistant/live-chat-store";

type OwnerAssistantChatProps = {
  businessSlug: string;
  businessId: string;
  userId: string;
  plan: BusinessPlan;
  /** From `?session=`; null for a new chat, whose session the first send mints. */
  sessionId: string | null;
  /** Server-rendered transcript for `sessionId`, used only on a cold load. */
  initialMessages: AssistantHistoryRow[];
  /** Pre-filled prompt (e.g. from the dashboard home box) sent once on arrival. */
  autoPrompt?: string | null;
};

/** Present-participle labels for the tools the assistant can run. */
const TOOL_LABELS: Record<string, string> = {
  search_inquiries: "Searching inquiries",
  get_inquiry_stats: "Calculating inquiry stats",
  search_quotes: "Searching quotes",
  get_quote_stats: "Calculating quote stats",
  search_customers: "Searching customers",
  get_conversion_analytics: "Calculating conversion",
  search_knowledge: "Searching knowledge base",
  get_follow_up_stats: "Checking follow-ups",
  create_inquiry: "Creating inquiry",
  create_quote: "Creating quote",
  update_inquiry_status: "Preparing status change",
  send_quote: "Preparing to send quote",
};

function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Using ${toolName}`;
}

/**
 * Map provider/raw errors to plain language. Raw JSON bodies and the bare
 * "An error occurred." string never render — detail stays in the logs.
 */
function friendlyAssistantError(message: string): string {
  const lower = (message || "").toLowerCase();
  if (
    !message.trim() ||
    lower.includes("an error occurred") ||
    lower.includes("{") ||
    lower.includes("groq") ||
    lower.includes("gemini") ||
    lower.includes("openrouter") ||
    lower.includes("model_not_found") ||
    lower.includes("429") ||
    lower.includes("500") ||
    lower.includes("503")
  ) {
    return "The assistant is temporarily unavailable. Please try again in a minute.";
  }
  return message;
}

// ---------------------------------------------------------------------------
// Turn grouping
// ---------------------------------------------------------------------------

/** A structured tool payload, as produced by `features/owner-assistant/tools`. */
type ToolPayload = {
  type?: string;
  summary?: string;
  confirmationId?: string;
};

type TurnBlock =
  | { kind: "user"; id: string; text: string }
  | {
      kind: "assistant";
      id: string;
      text: string;
      steps: ToolStep[];
      cards: Array<{ key: string; result: ToolPayload }>;
    };

/**
 * Collapse the message list into rendered turns.
 *
 * Live streaming puts a reply's text and its tool calls on one assistant
 * message, while rehydrated history arrives as one synthetic assistant message
 * per persisted row. Grouping consecutive assistant messages makes both shapes
 * render identically: one reply, one tool disclosure, one copy button.
 */
function toTurnBlocks(messages: UIMessage[]): TurnBlock[] {
  const blocks: TurnBlock[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const parts = message.parts ?? [];

    if (message.role === "user") {
      const text = collapseAttachmentBlocksForDisplay(
        parts
          .filter((part) => part.type === "text")
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("")
          .trim(),
      );
      if (text) blocks.push({ kind: "user", id: message.id, text });
      continue;
    }

    const last = blocks[blocks.length - 1];
    const block: TurnBlock =
      last && last.kind === "assistant"
        ? last
        : { kind: "assistant", id: message.id, text: "", steps: [], cards: [] };
    if (block !== last) blocks.push(block);
    if (block.kind !== "assistant") continue;

    for (const part of parts) {
      if (part.type === "text" && part.text.trim()) {
        block.text = block.text ? `${block.text}\n\n${part.text}` : part.text;
        continue;
      }
      // Live turns stream `tool-<name>` parts; rehydrated history arrives as
      // `dynamic-tool`. Both settle here once the call has an outcome.
      if (!isToolUIPart(part)) continue;
      if (part.state !== "output-available" && part.state !== "output-error") {
        continue;
      }
      const toolName = getToolName(part);
      const output =
        part.state === "output-available" &&
        part.output &&
        typeof part.output === "object"
          ? (part.output as ToolPayload)
          : null;
      const hasArgs =
        part.input && typeof part.input === "object"
          ? Object.keys(part.input as Record<string, unknown>).length > 0
          : false;
      block.steps.push({
        id: part.toolCallId,
        toolName,
        label: toolLabel(toolName),
        input: hasArgs ? part.input : undefined,
        failed: part.state === "output-error" || output?.type === "error",
      });
      if (output?.type) {
        block.cards.push({ key: part.toolCallId, result: output });
      }
    }
  }

  return blocks;
}

/** The tool currently executing, if a turn is mid-flight. */
function findActiveTool(messages: UIMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    for (const part of messages[index].parts ?? []) {
      if (
        isToolUIPart(part) &&
        (part.state === "input-streaming" || part.state === "input-available")
      ) {
        return getToolName(part);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

/**
 * The Assistant surface — one component for a new chat and for any saved
 * conversation, mounted once per visit to the section.
 *
 * With no conversation yet the title and composer sit centred as one block;
 * the first send pins the composer over the bottom of the transcript so only
 * the input box covers messages. The session is minted by that first request
 * (the route returns `X-Session-Id`) and recorded in the URL as `?session=…`,
 * so a reload lands back on it.
 *
 * The conversation is held in a module-level store rather than in React state,
 * which is what lets it survive route refreshes and navigation away.
 */
export function OwnerAssistantChat({
  businessSlug,
  businessId,
  userId,
  plan,
  sessionId,
  initialMessages,
  autoPrompt,
}: OwnerAssistantChatProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Selected files live in local state (File objects can't survive the
  // module-level conversation store) and ride the next send only.
  const [files, setFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const assistantPath = getBusinessAssistantPath(businessSlug);

  /**
   * The conversation itself lives outside React (`live-chat-store`), so a route
   * refresh, a server action, or a trip to another dashboard page cannot throw
   * away the transcript or cut off a stream. Coming back through the sidebar
   * reopens whatever was last open in this business.
   */
  const [conversation, setConversation] = useState(() =>
    resolveLiveConversation({
      userId,
      businessSlug,
      sessionId,
      // A `?q=` hand-off from the dashboard is a new question, not a resume.
      preferNew: Boolean(autoPrompt),
      // Read lazily: the server transcript is only touched when a conversation
      // has to be built from scratch — a live one always outranks a snapshot.
      history: () => initialMessages,
    }),
  );

  // Store writes (a minted session, composer text, a plan-limit notice) happen
  // outside React state, so re-render on the store's version instead.
  useSyncExternalStore(
    subscribeToLiveChat,
    getLiveChatVersion,
    getLiveChatVersion,
  );

  const conversationKey = conversation.key;
  const activeSessionId = conversation.sessionId;
  const input = conversation.draft;
  const limitMessage = conversation.limitMessage;

  const setInput = useCallback(
    (value: string) => setConversationDraft(conversationKey, value),
    [conversationKey],
  );

  const setLimitMessage = useCallback(
    (value: string | null) =>
      setConversationLimitMessage(conversationKey, value),
    [conversationKey],
  );

  // The URL can point at a different conversation than the one on screen — the
  // history panel links to `?session=…`, and a reload arrives cold. Adopt it in
  // place rather than remounting the surface.
  useEffect(() => {
    const next = resolveLiveConversation({
      userId,
      businessSlug,
      sessionId,
      history: () => initialMessages,
    });
    // Syncing the router's URL — an external system — into the mounted surface.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversation((current) => (current === next ? current : next));
  }, [businessSlug, initialMessages, sessionId, userId]);

  const { messages, sendMessage, regenerate, status, error, setMessages, stop } =
    useChat<UIMessage>({ chat: conversation.chat });

  const isLoading = status === "submitted" || status === "streaming";
  const blocks = useMemo(() => toTurnBlocks(messages), [messages]);
  const activeTool = useMemo(
    () => (isLoading ? findActiveTool(messages) : null),
    [isLoading, messages],
  );
  const isEmpty = blocks.length === 0 && !isLoading;
  const lastBlock = blocks[blocks.length - 1];
  const streamingText =
    isLoading && lastBlock?.kind === "assistant" && lastBlock.text.length > 0;
  const statusLabel = !isLoading
    ? null
    : activeTool
      ? toolLabel(activeTool)
      : streamingText
        ? null
        : "Thinking";

  const transcriptKey = useMemo(() => {
    const lastText =
      lastBlock?.kind === "assistant"
        ? lastBlock.text.length
        : lastBlock?.kind === "user"
          ? lastBlock.text.length
          : 0;
    return `${blocks.length}:${lastText}:${statusLabel ?? ""}:${messages.length}`;
  }, [blocks.length, lastBlock, messages.length, statusLabel]);

  const { containerRef, detached, scrollToLatestSmooth, jumpToLatest } =
    useChatScroll({
      contentKey: transcriptKey,
      streaming: isLoading,
    });

  const refreshFromSession = useCallback(async () => {
    const id = activeSessionId;
    if (!id) return;
    const response = await fetch(
      `/api/ai/owner-assistant/session/${id}?businessSlug=${businessSlug}`,
    );
    if (!response.ok) return;
    const data = await response.json();
    setMessages(historyToUIMessages(data.messages ?? []));
  }, [activeSessionId, businessSlug, setMessages]);

  /**
   * Read at send time rather than captured once, so the session id minted by
   * the first send is attached to every message after it.
   */
  const requestBody = useCallback(
    () => ({
      businessSlug,
      sessionId: activeSessionId ?? undefined,
    }),
    [activeSessionId, businessSlug],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (isLoading) return;
      const attached = files;
      setInput("");
      setFiles([]);
      setAttachError(null);
      setLimitMessage(null);
      if (attached.length === 0) {
        void sendMessage({ text }, { body: requestBody() });
      } else {
        // Files travel as data URLs in the JSON body (never as message
        // parts), so history never re-sends bytes. The server parses them
        // for this turn only.
        void (async () => {
          try {
            const attachments = await readFilesAsDataAttachments(attached);
            void sendMessage({ text }, { body: { ...requestBody(), attachments } });
          } catch {
            setAttachError("Couldn't read those files. Try again.");
            setInput(text);
          }
        })();
      }
      // Deliberate, smooth — acknowledges the reader's own send.
      scrollToLatestSmooth();
    },
    [
      files,
      isLoading,
      requestBody,
      scrollToLatestSmooth,
      sendMessage,
      setInput,
      setLimitMessage,
    ],
  );

  const composerActions = (
    <AttachmentPickerButton
      disabled={isLoading}
      maxFiles={2}
      onError={setAttachError}
      onPick={(picked) => setFiles((current) => [...current, ...picked])}
      selectedCount={files.length}
    />
  );
  const composerChips = (
    <>
      <AttachmentChips
        files={files}
        onRemove={(index) =>
          setFiles((current) => current.filter((_, i) => i !== index))
        }
      />
      {attachError ? (
        <p className="px-4 pt-1.5 text-xs text-destructive" role="alert">
          {attachError}
        </p>
      ) : null}
    </>
  );

  // Start over without a navigation: a fresh conversation, whose session the
  // next send mints.
  const handleNewChat = useCallback(() => {
    stop();
    setConversation(startNewConversation({ userId, businessSlug }));
  }, [businessSlug, stop, userId]);

  /**
   * Keep the URL on the live conversation, as a search param on this same
   * route. A path change (the old `/assistant/chat/<id>`) leaves the router's
   * canonical URL disagreeing with the mounted page, and the next refresh
   * settles that by swapping the page segment out from under an open stream.
   * Rewriting in place also drops `?q=`, so a reload cannot resend a hand-off.
   *
   * No dependency list on purpose: the guard is two string reads, and the URL
   * changes underneath this surface (sidebar link, history traversal) without
   * any prop or store value changing.
   */
  useEffect(() => {
    // A render that lands while the router is already on another page must not
    // drag the URL back to the Assistant.
    if (window.location.pathname !== assistantPath) return;
    const target = activeSessionId
      ? `${assistantPath}?session=${activeSessionId}`
      : assistantPath;
    if (`${window.location.pathname}${window.location.search}` === target) {
      return;
    }
    window.history.replaceState(null, "", target);
  });

  // Deliver a prompt handed over from the dashboard home box without a second
  // user action. The flag belongs to the conversation, so a remount mid-send
  // cannot fire it twice.
  useEffect(() => {
    if (!autoPrompt || conversation.autoSent || status !== "ready") return;
    markConversationAutoSent(conversationKey);
    if (messages.length > 0) return;
    void sendMessage({ text: autoPrompt }, { body: requestBody() });
  }, [
    autoPrompt,
    conversation,
    conversationKey,
    messages.length,
    requestBody,
    sendMessage,
    status,
  ]);

  // Let the history panel pick up new titles and ordering once a turn lands.
  useEffect(() => {
    if (status !== "ready" || messages.length <= conversation.announced) return;
    markConversationAnnounced(conversationKey, messages.length);
    notifyAssistantHistoryChanged();
  }, [conversation, conversationKey, messages.length, status]);

  const handleDecision = useCallback(
    async (confirmationId: string, decision: "approved" | "rejected") => {
      const id = activeSessionId;
      if (!id) return;
      setConfirmingId(confirmationId);
      const result = await confirmAssistantToolAction({
        businessSlug,
        sessionId: id,
        confirmationId,
        decision,
      });
      setConfirmingId(null);
      await refreshFromSession();

      // A refused operation comes back as `ok: false` with the reason. The
      // transcript shows it, but the owner also needs to see why nothing
      // happened.
      if ("ok" in result && result.ok === false) {
        toast.error(result.error);
      }
    },
    [activeSessionId, businessSlug, refreshFromSession],
  );

  const handleConfirm = useCallback(
    (confirmationId: string) => void handleDecision(confirmationId, "approved"),
    [handleDecision],
  );

  const handleCancel = useCallback(
    (confirmationId: string) => void handleDecision(confirmationId, "rejected"),
    [handleDecision],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-assistant-pane="">
      {/* New chat on the left, history on the right. Portals into the
          mobile navbar below `lg`. */}
      <MobileHeaderSlot desktopClassName="flex items-center justify-between gap-2 px-3 pt-3 md:px-6">
        <Button
          aria-label="New chat"
          title="New chat"
          disabled={isEmpty}
          onClick={handleNewChat}
          size="sm"
          className={mobileNavbarIconButtonClassName}
          type="button"
          variant="ghost"
        >
          <MessageSquarePlus data-icon="inline-start" />
          <span className="hidden lg:inline">New chat</span>
        </Button>
        <AssistantHistoryPanel
          activeSessionId={activeSessionId}
          businessSlug={businessSlug}
          userId={userId}
        />
      </MobileHeaderSlot>

      {/* Transcript fills the pane; the composer overlays the bottom so only
          the input box covers messages. */}
      <div
        className="chat-stage min-h-0 flex-1"
        data-conversation={isEmpty ? "empty" : "active"}
      >
        <div
          className="chat-stage-transcript ai-chat-scrollbar px-3 md:px-6"
          ref={containerRef}
        >
          <div className="chat-stage-transcript-inner mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 pt-6 pb-2">
            {isEmpty ? (
              <div className="motion-card-enter my-auto flex w-full flex-col items-center gap-5 py-6 text-center">
                <p className="text-xl font-medium tracking-tight text-balance sm:text-2xl">
                  How can I help with your business?
                </p>
                <div className="w-full">
                  {composerChips}
                  <ChatComposer
                    actions={composerActions}
                    ariaLabel="Message the assistant"
                    autoFocus
                    busy={isLoading}
                    maxLength={2000}
                    onStop={stop}
                    onSubmit={handleSend}
                    onValueChange={setInput}
                    placeholder="Ask about inquiries, quotes, or customers"
                    value={input}
                  />
                </div>
                <RecentConversations businessSlug={businessSlug} userId={userId} />
              </div>
            ) : null}

            {blocks.map((block) =>
              block.kind === "user" ? (
                <UserTurn key={block.id} text={block.text} />
              ) : (
                <AssistantTurn
                  block={block}
                  businessSlug={businessSlug}
                  confirmingId={confirmingId}
                  key={block.id}
                  onCancel={handleCancel}
                  onConfirm={handleConfirm}
                  streaming={isLoading && block === lastBlock}
                />
              ),
            )}

            {statusLabel ? <ChatStatusLine label={statusLabel} /> : null}

            {limitMessage ? (
              <UpgradePrompt
                description={limitMessage}
                plan={plan}
                size="md"
                upgradeAction={{
                  userId,
                  businessId,
                  businessSlug,
                  currentPlan: plan,
                }}
                variant="card"
              />
            ) : null}

            {error && !limitMessage ? (
              <div className="flex items-center gap-2 text-sm text-destructive" role="alert">
                <p>{friendlyAssistantError(error.message || "")}</p>
                <Button
                  aria-label="Retry response"
                  onClick={() => void regenerate()}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <RotateCcw />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {!isEmpty ? (
          <div className="chat-composer-footer z-10 px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
            {detached ? <ChatJumpToLatest onJump={jumpToLatest} /> : null}
            <div className="mx-auto w-full max-w-3xl">
              {composerChips}
              <ChatComposer
                actions={composerActions}
                ariaLabel="Message the assistant"
                busy={isLoading}
                maxLength={2000}
                onStop={stop}
                onSubmit={handleSend}
                onValueChange={setInput}
                placeholder="Ask about inquiries, quotes, or customers"
                value={input}
              />
            </div>
          </div>
        ) : null}

        <div aria-hidden="true" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent history
// ---------------------------------------------------------------------------

type RecentHistoryItem = {
  id: string;
  title: string | null;
  lastMessageAt: string;
};

/**
 * The newest saved conversations under the empty-state composer. Seeds from
 * the shared history cache when the panel has already warmed it, so returning
 * to a new chat paints instantly; otherwise renders nothing until the first
 * page loads — and nothing at all for a brand-new account — so the empty
 * state keeps fitting the viewport.
 */
function RecentConversations({
  businessSlug,
  userId,
}: {
  businessSlug: string;
  userId: string;
}) {
  const [items, setItems] = useState<RecentHistoryItem[] | null>(
    () =>
      getCachedAssistantHistory(userId, businessSlug)?.items.slice(0, 5).map(
        (session) => ({
          id: session.id,
          title: session.title,
          lastMessageAt: session.lastMessageAt,
        }),
      ) ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const result = await listAssistantSessionsAction({
        businessSlug,
        limit: 5,
        offset: 0,
      });
      if (cancelled || "error" in result) return;
      setItems(
        result.sessions.map((session) => ({
          id: session.id,
          title: session.title,
          lastMessageAt: session.lastMessageAt,
        })),
      );
    };
    void refresh();
    window.addEventListener(ASSISTANT_HISTORY_CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(ASSISTANT_HISTORY_CHANGED_EVENT, refresh);
    };
  }, [businessSlug]);

  if (!items || items.length === 0) return null;

  return (
    <div className="w-full">
      <p className="px-1 pb-1 text-left text-sm font-medium text-foreground">
        Recent conversations
      </p>
      <div className="flex flex-col divide-y divide-border/60">
        {items.map((item) => (
          <Link
            className="group flex w-full items-center gap-2 truncate px-1 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={`${getBusinessAssistantPath(businessSlug)}?session=${item.id}`}
            key={item.id}
            prefetch
          >
            <span className="truncate">{item.title ?? "New conversation"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

/** The one bubble on the surface: what the owner said. */
function UserTurn({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="motion-card-enter chat-bubble max-w-[85%] bg-muted px-4 py-2.5 text-sm whitespace-pre-wrap text-foreground">
        {text}
      </div>
    </div>
  );
}

const noop = () => {};

/**
 * A reply: the tool process on top (collapsed to one line), the prose, any
 * structured result cards, then the copy action once the turn has landed.
 */
function AssistantTurn({
  block,
  businessSlug,
  confirmingId,
  onCancel,
  onConfirm,
  streaming,
}: {
  block: Extract<TurnBlock, { kind: "assistant" }>;
  businessSlug: string;
  confirmingId: string | null;
  onCancel: (confirmationId: string) => void;
  onConfirm: (confirmationId: string) => void;
  streaming: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {block.steps.length > 0 ? (
        <ToolProcessDisclosure steps={block.steps} />
      ) : null}

      {block.text ? (
        <ChatMarkdown content={block.text} streaming={streaming} />
      ) : null}

      {block.cards.map((card) => {
        const busy =
          Boolean(card.result.confirmationId) &&
          card.result.confirmationId === confirmingId;
        return (
          <div
            aria-busy={busy || undefined}
            className={cn(busy && "pointer-events-none opacity-60")}
            key={card.key}
          >
            <ToolResultRenderer
              businessSlug={businessSlug}
              onCancel={busy ? noop : onCancel}
              onConfirm={busy ? noop : onConfirm}
              result={
                card.result as unknown as Parameters<
                  typeof ToolResultRenderer
                >[0]["result"]
              }
            />
          </div>
        );
      })}

      {block.text && !streaming ? <CopyButton value={block.text} /> : null}
    </div>
  );
}
