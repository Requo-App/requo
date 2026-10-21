"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { Ellipsis, MessageSquarePlus, RotateCcw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BusinessAvatar } from "@/components/shared/business-avatar";
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
import { useChatScroll } from "@/components/shared/chat/use-chat-scroll";
import { MadeWithRequo } from "@/components/shared/made-with-requo";
import {
  approveAgentProposalAction,
  createAgentSessionAction,
  discardAgentProposalAction,
} from "@/features/ai-agent/actions";
import {
  ProposedInquiryCard,
  toEditableValues,
  type ProposalValues,
} from "@/features/ai-agent/components/proposed-inquiry-card";
import type { ProposedInquiry } from "@/features/ai-agent/types";

type ChatInterfaceProps = {
  businessSlug: string;
  businessName: string;
  /** Public logo URL; falls back to the business initials. */
  businessLogoUrl?: string | null;
  /** Show the "Made with Requo" watermark (false when the plan removed it). */
  showWatermark?: boolean;
  /** Link to the traditional inquiry form as a fallback capture path. */
  fallbackFormHref?: string;
  /** Starter prompts derived from what the business actually offers. */
  recommendations?: string[];
};

/** Where the visitor's own conversation token lives for the tab's lifetime. */
function sessionKey(slug: string) {
  return `requo-agent-session:${slug}`;
}

/**
 * What the visitor is told while a tool runs.
 *
 * Deliberately plain-language and business-voiced: internal tool names and
 * arguments are never surfaced on the public surface, and there is no
 * expandable process view here (that belongs to the owner assistant).
 */
const TOOL_LABELS: Record<string, string> = {
  search_knowledge: "Checking our information",
  get_business_info: "Checking business details",
  get_services: "Checking available services",
  propose_inquiry: "Putting your inquiry together",
};

function toolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? "Working on it";
}

// ---------------------------------------------------------------------------
// Turn grouping
// ---------------------------------------------------------------------------

type Turn = { kind: "user" | "assistant"; id: string; text: string };

/**
 * Collapse the message list into rendered turns.
 *
 * Only prose reaches the visitor: tool traffic drives the status line while a
 * turn is in flight and then disappears. Consecutive assistant messages are
 * merged so a rehydrated transcript (one message per persisted row) reads the
 * same as a live one.
 */
function toTurns(messages: UIMessage[]): Turn[] {
  const turns: Turn[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = collapseAttachmentBlocksForDisplay(
      (message.parts ?? [])
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("")
        .trim(),
    );

    const last = turns[turns.length - 1];
    if (message.role === "assistant" && last?.kind === "assistant") {
      if (text) last.text = last.text ? `${last.text}\n\n${text}` : text;
      continue;
    }
    if (text) turns.push({ kind: message.role, id: message.id, text });
  }

  return turns;
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

/**
 * The latest Proposed Inquiry from the live stream, if any.
 *
 * This is the first thing the customer surface renders from a tool part. The
 * surface deliberately strips all other tool traffic — the carve-out is
 * intentional and narrow: one tool, one card. A superseding proposal replaces
 * the old one (latest wins) rather than stacking a second card.
 */
function findLatestProposal(messages: UIMessage[]): ProposedInquiry | null {
  let latest: ProposedInquiry | null = null;
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (!isToolUIPart(part)) continue;
      if (getToolName(part) !== "propose_inquiry") continue;
      if (part.state !== "output-available") continue;
      const output = part.output as
        | { proposal?: ProposedInquiry; message?: string }
        | ProposedInquiry
        | null;
      if (!output || typeof output !== "object") continue;
      const proposal =
        "proposal" in output && output.proposal
          ? (output.proposal as ProposedInquiry)
          : (output as ProposedInquiry);
      if (
        proposal &&
        typeof proposal.id === "string" &&
        proposal.values &&
        typeof proposal.values === "object"
      ) {
        latest = proposal;
      }
    }
  }
  return latest;
}

/** Errors that mean the stored token can no longer be used. */
function isSessionGone(message: string): boolean {
  return (
    message.includes("Invalid or expired session") ||
    message.includes("not enabled") ||
    message.includes("not available on this plan")
  );
}

/**
 * Map provider/raw errors to friendly copy. Provider JSON bodies, internal
 * model names, and the generic "An error occurred." never reach the
 * transcript — the visitor gets plain language plus the Inquiry form path.
 */
function friendlyAgentError(message: string): string {
  const lower = message.toLowerCase();
  if (
    !message.trim() ||
    lower.includes("an error occurred") ||
    lower.includes("{") ||
    lower.includes("groq") ||
    lower.includes("cerebras") ||
    lower.includes("gemini") ||
    lower.includes("openrouter") ||
    lower.includes("mistral") ||
    lower.includes("model") ||
    lower.includes("429") ||
    lower.includes("500") ||
    lower.includes("503")
  ) {
    return "Chat is temporarily unavailable. Please try again in a moment, or use the inquiry form so we can still reach you.";
  }
  return message;
}

function cleanProposalForSend(values: ProposalValues): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {
    customerName: values.customerName.trim(),
    customerContactMethod: values.customerContactMethod.trim(),
    customerContactHandle: values.customerContactHandle.trim(),
    serviceSlug: values.serviceSlug.trim(),
    details: values.details.trim(),
  };
  const email = values.customerEmail?.trim();
  if (email) cleaned.customerEmail = email;
  const budget = values.budgetText?.trim();
  if (budget) cleaned.budgetText = budget;
  const deadline = values.requestedDeadline?.trim();
  if (deadline) cleaned.requestedDeadline = deadline;
  return cleaned;
}

function cleanProposalForApproval(values: ProposalValues): Record<string, unknown> {
  return {
    customerName: values.customerName.trim(),
    ...(values.customerEmail?.trim()
      ? { customerEmail: values.customerEmail.trim() }
      : {}),
    customerContactMethod: values.customerContactMethod.trim(),
    customerContactHandle: values.customerContactHandle.trim(),
    serviceSlug: values.serviceSlug.trim(),
    details: values.details.trim(),
    ...(values.budgetText?.trim()
      ? { budgetText: values.budgetText.trim() }
      : {}),
    ...(values.requestedDeadline?.trim()
      ? { requestedDeadline: values.requestedDeadline.trim() }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

/**
 * The public chat surface at `/b/[slug]/chat`.
 *
 * The visitor lands on a centred greeting and composer; the first send mints
 * the session (so a visitor who never types leaves nothing behind) and pins
 * the composer over the bottom of the transcript so only the input box covers
 * messages. The conversation token lives in `sessionStorage`, so a reload
 * restores the visitor's own transcript — and only theirs (see ADR 004).
 */
export function ChatInterface({
  businessSlug,
  businessName,
  businessLogoUrl,
  showWatermark = false,
  fallbackFormHref,
  recommendations = [],
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  // Selected files ride the next send only — never stored, never re-sent.
  const [files, setFiles] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [stagedProposal, setStagedProposal] =
    useState<ProposedInquiry | null>(null);
  const [cardValues, setCardValues] = useState<ProposalValues | null>(null);
  const [approving, setApproving] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/ai/agent/chat" }),
    [],
  );

  const {
    messages,
    sendMessage,
    regenerate,
    setMessages,
    status,
    error,
    clearError,
    stop,
  } = useChat<UIMessage>({ id: "agent-chat", transport });

  const isLoading = status === "submitted" || status === "streaming";
  const turns = useMemo(() => toTurns(messages), [messages]);
  const activeTool = useMemo(
    () => (isLoading ? findActiveTool(messages) : null),
    [isLoading, messages],
  );
  const isEmpty = turns.length === 0 && !isLoading && !minting;
  const lastTurn = turns[turns.length - 1];
  const streamingText =
    isLoading && lastTurn?.kind === "assistant" && lastTurn.text.length > 0;
  const statusLabel = minting
    ? "Starting conversation"
    : !isLoading
      ? null
      : activeTool
        ? toolLabel(activeTool)
        : streamingText
          ? null
          : "Typing";

  /** Drop a token the server no longer accepts; the next send mints a fresh one. */
  const forgetSession = useCallback(() => {
    tokenRef.current = null;
    try {
      sessionStorage.removeItem(sessionKey(businessSlug));
    } catch {
      // Private-mode storage failures are not worth surfacing.
    }
    setMessages([]);
  }, [businessSlug, setMessages]);

  /** Start over without a reload: clear the local transcript so the next send mints a fresh session. */
  const handleNewChat = useCallback(() => {
    stop();
    tokenRef.current = null;
    try {
      sessionStorage.removeItem(sessionKey(businessSlug));
    } catch {
      // Private-mode storage failures are not worth surfacing.
    }
    setMessages([]);
    setStagedProposal(null);
    setCardValues(null);
    setProposalError(null);
    setNotice(null);
    setFiles([]);
    setAttachError(null);
    clearError();
    setInput("");
  }, [businessSlug, clearError, setMessages, stop]);

  // Restore this visitor's own transcript when the tab already holds a token.
  // A reload brings both the transcript and the pending card back — server
  // state is authoritative.
  useEffect(() => {
    let cancelled = false;
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem(sessionKey(businessSlug));
    } catch {
      stored = null;
    }
    if (!stored) return;
    tokenRef.current = stored;

    void (async () => {
      try {
        const response = await fetch("/api/ai/agent/session", {
          headers: { Authorization: `Bearer ${stored}` },
        });
        if (!response.ok) {
          // Expired or unknown — start clean rather than stranding the visitor.
          if (!cancelled) forgetSession();
          return;
        }
        const data = await response.json();
        const rows: Array<{ id: string; role: "user" | "assistant"; content: string }> =
          Array.isArray(data.messages) ? data.messages : [];
        if (cancelled) return;
        if (rows.length > 0) {
          setMessages(
            rows.map((row) => ({
              id: row.id,
              role: row.role,
              parts: [
                {
                  type: "text",
                  text:
                    row.role === "user"
                      ? collapseAttachmentBlocksForDisplay(row.content)
                      : row.content,
                },
              ],
            })) as UIMessage[],
          );
        }
        const restored = (data.proposedInquiry ?? null) as ProposedInquiry | null;
        if (restored && !cancelled) {
          setStagedProposal(restored);
          setCardValues(toEditableValues(restored));
        }
      } catch {
        // Offline or a transient failure: the fresh empty state is fine.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [businessSlug, forgetSession, setMessages]);

  // Derived, not stored: the message follows the chat error, and only the
  // token cleanup is a side effect.
  const sessionExpired = Boolean(error && isSessionGone(error.message));
  const noticeText =
    notice ??
    (sessionExpired
      ? "That conversation expired. Send a message to start a new one."
      : null);

  useEffect(() => {
    if (!sessionExpired) return;
    forgetSession();
    // Syncing external session expiry into local card state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset proposal UI when the server session expires.
    setStagedProposal(null);
    setCardValues(null);
  }, [sessionExpired, forgetSession]);

  // Live turns render the proposing tool's output part. A superseding
  // proposal replaces the old one in place rather than stacking a second
  // card — latest wins. Server state stays authoritative (reload path above).
  const liveProposal = useMemo(() => findLatestProposal(messages), [messages]);

  useEffect(() => {
    if (!liveProposal) return;
    if (stagedProposal?.id === liveProposal.id) return;
    // A revision supersedes: adopt the new values. The revision was built
    // from the staged values the server already merged, so a manual edit
    // the visitor typed survives here rather than being clobbered.
    // Syncing the external message stream into local card state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Adopt the server-provided proposal revision.
    setStagedProposal(liveProposal);
    setCardValues(toEditableValues(liveProposal));
    setProposalError(null);
  }, [liveProposal, stagedProposal?.id]);

  const transcriptKey = useMemo(() => {
    const lastText = lastTurn?.text.length ?? 0;
    return `${turns.length}:${lastText}:${statusLabel ?? ""}:${messages.length}:${stagedProposal?.id ?? ""}`;
  }, [turns.length, lastTurn, statusLabel, messages.length, stagedProposal?.id]);

  const { containerRef, detached, scrollToLatestSmooth, jumpToLatest } =
    useChatScroll({
      contentKey: transcriptKey,
      streaming: isLoading,
    });

  /**
   * Send, minting the session first when this is the visitor's opening
   * message. If minting fails the text is handed back to the composer so
   * nothing the visitor typed is lost.
   *
   * Card edits ride along on the existing chat request body: every send
   * persists the current card values before the model runs.
   */
  const handleSend = useCallback(
    async (text: string) => {
      if (isLoading || minting) return;
      const attached = files;
      setInput("");
      setFiles([]);
      setAttachError(null);
      setNotice(null);
      clearError();

      // Read at send time so edits typed into the card survive the next chat
      // message instead of being clobbered by it.
      const ridingValues =
        stagedProposal?.status === "pending" && cardValues
          ? cleanProposalForSend(cardValues)
          : undefined;

      if (!tokenRef.current) {
        setMinting(true);
        const result = await createAgentSessionAction({
          businessSlug,
          metadata: {
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          },
        });
        setMinting(false);

        if (!result.success) {
          setNotice(
            result.error ?? "Unable to start a conversation. Please try again.",
          );
          setInput(text);
          return;
        }

        tokenRef.current = result.sessionToken;
        try {
          sessionStorage.setItem(sessionKey(businessSlug), result.sessionToken);
        } catch {
          // Without storage the conversation still works for this page view.
        }
      }

      // The token is read here rather than captured in the transport, so the
      // one minted just above is attached to this very first send.
      const baseBody = {
        sessionToken: tokenRef.current,
        ...(ridingValues ? { proposedInquiryValues: ridingValues } : {}),
      };
      if (attached.length === 0) {
        void sendMessage({ text }, { body: baseBody });
      } else {
        // Files travel as data URLs in the JSON body (never as message
        // parts), so history never re-sends bytes. The server parses them
        // for this turn only.
        try {
          const attachments = await readFilesAsDataAttachments(attached);
          void sendMessage({ text }, { body: { ...baseBody, attachments } });
        } catch {
          setNotice("Couldn't read those files. Please try again.");
          setInput(text);
          return;
        }
      }
      scrollToLatestSmooth();
    },
    [
      businessSlug,
      cardValues,
      clearError,
      files,
      isLoading,
      minting,
      scrollToLatestSmooth,
      sendMessage,
      stagedProposal,
    ],
  );

  const composerActions = (
    <AttachmentPickerButton
      disabled={isLoading || minting}
      maxFiles={1}
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

  const handleApprove = useCallback(async () => {
    const token = tokenRef.current;
    const proposal = stagedProposal;
    if (!token || !proposal || proposal.status !== "pending" || !cardValues)
      return;
    setApproving(true);
    setProposalError(null);
    const cleaned = cleanProposalForApproval(cardValues);
    const result = await approveAgentProposalAction({
      sessionToken: token,
      values: cleaned,
      proposalId: proposal.id,
    });
    setApproving(false);
    if (!result.success) {
      setProposalError(result.error);
      return;
    }
    // The card stays as the receipt of what was submitted. The composer stays
    // live so the visitor can ask a follow-up without opening a new
    // conversation.
    setStagedProposal({
      ...proposal,
      status: "approved",
      inquiryId: result.inquiryId,
      values: cleaned as ProposedInquiry["values"],
    });
    scrollToLatestSmooth();
  }, [stagedProposal, cardValues, scrollToLatestSmooth]);

  const handleDiscard = useCallback(async () => {
    const token = tokenRef.current;
    const proposal = stagedProposal;
    if (!token || !proposal || proposal.status !== "pending") return;
    setDiscarding(true);
    setProposalError(null);
    const result = await discardAgentProposalAction({
      sessionToken: token,
      proposalId: proposal.id,
    });
    setDiscarding(false);
    if (!result.success) {
      setProposalError(result.error);
      return;
    }
    // Discarding leaves the conversation open — no confirmation, no new
    // session. The persisted assistant line tells the model it was declined.
    setStagedProposal(null);
    setCardValues(null);
  }, [stagedProposal]);

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      {/* Slim header: whose chat this is, and nothing else. */}
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <BusinessAvatar
          loading="eager"
          logoUrl={businessLogoUrl}
          name={businessName}
        />
        <p className="min-w-0 truncate text-sm leading-tight font-semibold">
          {businessName}
        </p>
        {!isEmpty ? (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              onClick={handleNewChat}
              size="sm"
              type="button"
              variant="ghost"
            >
              <MessageSquarePlus data-icon="inline-start" />
              New chat
            </Button>
            {fallbackFormHref ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="More options"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link href={fallbackFormHref}>Use inquiry form</Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Transcript fills the pane; the composer overlays the bottom so only
          the input box covers messages. */}
      <div
        className="chat-stage min-h-0 flex-1"
        data-conversation={isEmpty ? "empty" : "active"}
      >
        <div
          aria-atomic="false"
          aria-label="Conversation"
          aria-live="polite"
          className="chat-stage-transcript ai-chat-scrollbar px-4 sm:px-6"
          ref={containerRef}
        >
          <div className="chat-stage-transcript-inner mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 pt-6 pb-2">
            {isEmpty ? (
              <div className="motion-card-enter my-auto flex w-full flex-col items-center gap-5 py-6 text-center">
                <BusinessAvatar
                  loading="eager"
                  logoUrl={businessLogoUrl}
                  name={businessName}
                  size="lg"
                />
                <p className="text-xl font-medium tracking-tight text-balance sm:text-2xl">
                  How can we help?
                </p>
                {fallbackFormHref ? (
                  <p className="motion-delay-2 text-center text-xs text-muted-foreground">
                    Prefer a form?{" "}
                    <Link
                      className="underline underline-offset-4 hover:text-foreground"
                      href={fallbackFormHref}
                    >
                      Use the inquiry form
                    </Link>
                  </p>
                ) : null}
                <div className="w-full">
                  {composerChips}
                  <ChatComposer
                    actions={composerActions}
                    ariaLabel={`Message ${businessName}`}
                    autoFocus
                    busy={isLoading}
                    disabled={minting}
                    maxLength={2000}
                    onStop={stop}
                    onSubmit={(text) => void handleSend(text)}
                    onValueChange={setInput}
                    placeholder="Tell us what you're looking for"
                    value={input}
                  />
                </div>
                {recommendations.length > 0 ? (
                  <div className="w-full">
                    <p className="px-1 pb-1 text-left text-sm font-medium text-foreground">
                      Recommended for you
                    </p>
                    <div className="flex flex-col divide-y divide-border/60">
                      {recommendations.map((prompt) => (
                        <button
                          className="group flex w-full items-center gap-2 truncate px-1 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          key={prompt}
                          onClick={() => void handleSend(prompt)}
                          type="button"
                        >
                          <span className="truncate">{prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {turns.map((turn) =>
              turn.kind === "user" ? (
                <VisitorTurn key={turn.id} text={turn.text} />
              ) : (
                <ReplyTurn
                  key={turn.id}
                  streaming={isLoading && turn === lastTurn}
                  text={turn.text}
                />
              ),
            )}

            {stagedProposal && cardValues ? (
              <ProposedInquiryCard
                approving={approving}
                discarding={discarding}
                onApprove={() => void handleApprove()}
                onDiscard={() => void handleDiscard()}
                onValuesChange={setCardValues}
                proposal={stagedProposal}
                serverError={proposalError}
                values={cardValues}
              />
            ) : proposalError && !stagedProposal ? (
              <p className="text-sm text-destructive" role="alert">
                {proposalError}
              </p>
            ) : null}

            {statusLabel ? <ChatStatusLine label={statusLabel} /> : null}

            {noticeText ? (
              <Alert variant="destructive">
                <AlertDescription>{noticeText}</AlertDescription>
              </Alert>
            ) : null}

            {error && !noticeText ? (
              <Alert variant="destructive">
                <AlertDescription>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {friendlyAgentError(error.message || "")}
                    {fallbackFormHref ? (
                      <Link
                        className="underline underline-offset-4 hover:text-foreground"
                        href={fallbackFormHref}
                      >
                        Use the inquiry form
                      </Link>
                    ) : null}
                    <Button
                      aria-label="Retry response"
                      onClick={() =>
                        void regenerate({
                          // The session token travels with the retry. Without
                          // it the request had no token and the server
                          // answered 400, so the button could never work.
                          body: { sessionToken: tokenRef.current ?? "" },
                        })
                      }
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <RotateCcw />
                    </Button>
                  </span>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </div>

        {!isEmpty ? (
          <div className="chat-composer-footer z-10 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            {detached ? <ChatJumpToLatest onJump={jumpToLatest} /> : null}
            <div className="mx-auto w-full max-w-3xl">
              {composerChips}
              <ChatComposer
                actions={composerActions}
                ariaLabel={`Message ${businessName}`}
                busy={isLoading}
                disabled={minting}
                maxLength={2000}
                onStop={stop}
                onSubmit={(text) => void handleSend(text)}
                onValueChange={setInput}
                placeholder="Tell us what you're looking for"
                value={input}
              />
            </div>
          </div>
        ) : null}

        <div aria-hidden="true" />
      </div>

      {showWatermark ? (
        <div className="flex shrink-0 justify-center pb-4">
          <MadeWithRequo className="static" />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

/** The one bubble on the surface: what the visitor said. */
function VisitorTurn({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="motion-card-enter chat-bubble max-w-[85%] bg-muted px-4 py-2.5 text-[0.95rem] whitespace-pre-wrap text-foreground">
        {text}
      </div>
    </div>
  );
}

/** The business's reply: plain prose, with a copy action once it has landed. */
function ReplyTurn({
  streaming,
  text,
}: {
  streaming: boolean;
  text: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ChatMarkdown content={text} streaming={streaming} />
      {streaming ? null : <CopyButton label="Copy reply" value={text} />}
    </div>
  );
}
