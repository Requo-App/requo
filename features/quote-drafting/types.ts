import type { InquiryPageTemplate } from "@/features/inquiries/page-config";
import type { InquirySubmittedFieldSnapshot } from "@/features/inquiries/form-config";
import type { InquiryStatus } from "@/features/inquiries/types";
import type { BusinessType } from "@/features/inquiries/business-types";
import type { FollowUpChannel, FollowUpStatus } from "@/features/follow-ups/types";
import type {
  QuoteStatus,
} from "@/features/quotes/types";
import type { AiProviderName } from "@/lib/ai";

export const aiSurfaces = ["inquiry", "quote", "dashboard"] as const;

export type AiSurface = (typeof aiSurfaces)[number];

export type AiConversation = {
  id: string;
  userId: string;
  businessId: string;
  surface: AiSurface;
  entityId: string;
  title: string | null;
  isDefault: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiConversationSummary = AiConversation & {
  lastMessagePreview: string | null;
};

export const aiMessageRoles = ["user", "assistant", "system"] as const;

export type AiMessageRole = (typeof aiMessageRoles)[number];

export const aiMessageStatuses = [
  "completed",
  "generating",
  "failed",
] as const;

export type AiMessageStatus = (typeof aiMessageStatuses)[number];

export type AiMessage = {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  provider: AiProviderName | null;
  model: string | null;
  status: AiMessageStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AiMessagesPage = {
  messages: AiMessage[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type AiChatStreamEvent =
  | {
      type: "conversation";
      conversation: AiConversation;
    }
  | {
      type: "messages";
      userMessage: AiMessage;
      assistantMessage: AiMessage;
    }
  | {
      type: "meta";
      title: string;
      model: string;
      provider?: AiProviderName;
      providerModel?: string;
    }
  | {
      type: "status";
      message: string;
    }
  | {
      type: "delta";
      value: string;
    }
  | {
      type: "done";
      truncated: boolean;
    }
  | {
      type: "error";
      message: string;
    }
  | {
      type: "debug";
      info: AiChatDebugInfo;
    };

export type AiChatDebugInfo = {
  model: string;
  provider: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  toolCalls?: Array<{ name: string; durationMs?: number }>;
  steps?: number;
  systemPromptLength?: number;
  contextLength?: number;
};

export const aiAssistantTruncationMessage =
  "The response hit the current output limit. Ask the assistant to continue if you need the rest.";

export type InquiryAssistantContext = {
  business: {
    id: string;
    name: string;
    slug: string;
    businessType: BusinessType;
    shortDescription: string | null;
    contactEmail: string | null;
    defaultCurrency: string;
    defaultEmailSignature: string | null;
    defaultQuoteNotes: string | null;
    defaultQuoteTerms: string | null;
    industryCategory: string | null;
    inquiryHeadline: string | null;
    createdAt: Date;
    inquiryPageHeadline: string;
    inquiryPageTemplate: InquiryPageTemplate;
    publicInquiryEnabled: boolean;
  };
  inquiry: {
    id: string;
    serviceId: string | null;
    serviceName: string | null;
    serviceSlug: string | null;
    serviceBusinessType: BusinessType;
    customerName: string;
    customerEmail: string | null;
    customerContactMethod: string;
    customerContactHandle: string;
    requestedDeadline: string | null;
    budgetText: string | null;
    subject: string | null;
    details: string;
    source: string | null;
    status: InquiryStatus;
    submittedAt: Date;
    createdAt: Date;
    submittedFieldSnapshot: InquirySubmittedFieldSnapshot | null;
  };
  notes: Array<{
    id: string;
    body: string;
    createdAt: Date;
    authorName: string | null;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    createdAt: Date;
  }>;
  activities: Array<{
    id: string;
    type: string;
    summary: string;
    createdAt: Date;
    actorName: string | null;
  }>;
  followUps: Array<{
    id: string;
    inquiryId: string | null;
    quoteId: string | null;
    quoteNumber: string | null;
    quoteTitle: string | null;
    title: string;
    reason: string;
    channel: FollowUpChannel;
    dueAt: Date;
    completedAt: Date | null;
    skippedAt: Date | null;
    status: FollowUpStatus;
    createdAt: Date;
    updatedAt: Date;
  }>;
  relatedQuotes: Array<{
    id: string;
    quoteNumber: string;
    title: string;
    customerName: string;
    customerEmail: string | null;
    customerContactMethod: string;
    customerContactHandle: string;
    currency: string;
    notes: string | null;
    subtotalInCents: number;
    discountInCents: number;
    totalInCents: number;
    validUntil: string;
    status: QuoteStatus;
    sentAt: Date | null;
    acceptedAt: Date | null;
    publicViewedAt: Date | null;
    customerRespondedAt: Date | null;
    customerResponseMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    items: Array<{
      id: string;
      description: string;
      quantity: number;
      unitPriceInCents: number;
      lineTotalInCents: number;
      position: number;
    }>;
    activities: Array<{
      id: string;
      type: string;
      summary: string;
      createdAt: Date;
      actorName: string | null;
    }>;
  }>;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: Date;
  }>;
};

/**
 * Draft payload returned by the AI quote generator.
 * Values are normalised so the client can patch the editor without further parsing.
 *
 * The AI is not allowed to invent final prices. Each item is tagged with a
 * `reviewStatus` so the owner can see what was priced from approved sources
 * and what still needs human pricing before the quote is sent.
 */
export const aiQuoteDraftItemReviewStatuses = [
  "matched",
  "calculated",
  "needs_review",
  "no_pricing_found",
] as const;

export type AiQuoteDraftItemReviewStatus =
  (typeof aiQuoteDraftItemReviewStatuses)[number];

export type AiQuoteReadiness = "ready" | "needs_confirmation" | "scope_only";

export type AiQuoteProductStatus =
  | "verified"
  | "suggested"
  | "unpriced"
  | "owner_set";

export type AiQuoteKnowledgeCitation = {
  sourceType: "manual_entry" | "uploaded_file";
  sourceId: string;
  chunkId: string;
  title: string;
};

export const aiQuoteDraftItemPricingSources = [
  "pricing_library_block",
  "pricing_library_package",
  "past_quote",
  "business_memory",
  "owner_brief",
  "none",
] as const;

export type AiQuoteDraftItemPricingSource =
  (typeof aiQuoteDraftItemPricingSources)[number];

export const aiQuoteDraftItemConfidenceLevels = [
  "high",
  "medium",
  "low",
] as const;

export type AiQuoteDraftItemConfidence =
  (typeof aiQuoteDraftItemConfidenceLevels)[number];

export type AiQuoteDraftItem = {
  /** Short label for the item, shown in the editor as a chip/header. */
  name: string;
  /** Customer-facing description that becomes the quote line item description. */
  description: string;
  quantity: number;
  /**
   * Final price in cents. Only set for `matched` or `calculated` items.
   * Always 0 for `needs_review` and `no_pricing_found` so the owner can
   * see the missing price in the editor and the send guard can block delivery.
   */
  unitPriceInCents: number;
  /** Where the price came from. `none` when nothing was matched. */
  pricingSource: AiQuoteDraftItemPricingSource;
  /** Optional human-readable label describing the source (e.g. library entry name). */
  pricingSourceLabel: string | null;
  /** AI confidence in the chosen line item. */
  confidence: AiQuoteDraftItemConfidence;
  /** Required review state. Drives the editor warning + send guard. */
  reviewStatus: AiQuoteDraftItemReviewStatus;
  /**
   * Grounded pricing state persisted with the quote. `owner_set` when the
   * owner edited a generated item. Never set by the model — always
   * determined by server-side hydration/verification.
   */
  aiProductStatus: AiQuoteProductStatus | null;
  /** Source references behind the item's price, set by deterministic hydration. */
  aiEvidence: {
    entryId: string | null;
    itemId: string | null;
    sourceLabel: string | null;
    matchType: "exact" | "suggested" | "none";
    reason: string;
  } | null;
  /** Knowledge citations the item's scope or wording relied on. */
  aiKnowledgeCitations: AiQuoteKnowledgeCitation[];
  /** Short reason explaining why this item was chosen. */
  reason: string;
};

export type AiQuoteMissingInfoItem = {
  label: string;
  question: string;
  /** Critical questions must be resolved or acknowledged before sending. */
  critical?: boolean;
};

export type AiQuoteDraft = {
  title: string;
  notes: string | null;
  items: AiQuoteDraftItem[];
  missingInfo: AiQuoteMissingInfoItem[];
  clarificationMessage: string | null;
  /** Present when the draft leaned on a pricing library entry. */
  pricingLibraryEntryId?: string | null;
  model: string;
  provider: AiProviderName;
  rationale?: string | null;
  /** Count of items the owner still needs to price before the quote can be sent. */
  itemsNeedingReview: number;
  /**
   * Server-computed readiness. Never trusted from the model.
   * - `ready`: all items verified or owner-set, no critical questions.
   * - `needs_confirmation`: suggested matches or critical questions remain.
   * - `scope_only`: required items are unpriced or pricing coverage is missing.
   */
  readiness: AiQuoteReadiness;
  /** Correlation id persisted with the quote for observability. */
  aiGenerationId: string;
  /** Knowledge evidence the draft relied on (scope/wording, never pricing). */
  knowledgeCitations: AiQuoteKnowledgeCitation[];
};

export type AiQuoteDraftActionState = {
  error?: string;
  draft?: AiQuoteDraft;
};
