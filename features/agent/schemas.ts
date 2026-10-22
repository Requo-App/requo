/**
 * Agent Schemas
 *
 * Zod validation schemas for agent inputs and outputs.
 */

import { z } from "zod";

// Agent tone schema
export const agentToneSchema = z.enum(["friendly", "professional", "casual"]);

// Agent configuration schema
export const agentConfigSchema = z.object({
  tone: agentToneSchema.optional(),
  /**
   * Owner-authored guidance injected into the system prompt. Deliberately
   * uncapped here: a stored value that predates the 1k write cap must not fail
   * the whole parse (which would also drop the tone). The prompt builders run
   * it through `normalizeBusinessInstructions`, which truncates.
   */
  instructions: z.string().optional(),
  handoffTriggers: z
    .object({
      maxSearchAttempts: z.number().int().min(1).max(10).optional(),
      keywords: z.array(z.string()).optional(),
    })
    .optional(),
});

// Qualification state schema
export const qualificationStateSchema = z.object({
  collected: z.record(z.string(), z.boolean()),
  values: z.record(z.string(), z.string().nullable()),
  missing: z.array(z.string()),
});

// Create inquiry tool (also the propose tool input — every field the
// inquiry-params schema accepts is editable on the card).
// The Service is owned by the parent Service form: the agent resolves a live
// service slug via get_services instead of asking for free-text category.
export const createInquiryParamsSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  customerEmail: z.string().email("Invalid email").optional(),
  customerContactMethod: z.string().min(1, "Contact method is required"),
  customerContactHandle: z.string().min(1, "Contact handle is required"),
  serviceSlug: z.string().min(1, "Service is required"),
  details: z.string().min(1, "Details are required"),
  budgetText: z.string().optional(),
  requestedDeadline: z.string().optional(),
  additionalFields: z.record(z.string(), z.unknown()).optional(),
});

export const proposedInquirySchema = z.object({
  id: z.string().min(1),
  values: createInquiryParamsSchema,
  proposedAt: z.string().min(1),
  status: z.enum(["pending", "approved", "discarded"]),
  inquiryId: z.string().optional(),
});

export const agentSessionStateSchema = qualificationStateSchema.extend({
  proposedInquiry: proposedInquirySchema.nullable().optional(),
});

// Session metadata schema
/**
 * Session metadata. The schema is strict and bounded: the metadata column is
 * written from a public, unauthenticated action, so unknown keys and
 * oversized values must not reach the database.
 */
export const sessionMetadataSchema = z.object({
  userAgent: z.string().max(512).optional(),
  ipAddress: z.string().max(64).optional(),
  handoffReason: z.string().max(500).optional(),
  handoffRecommendation: z.string().max(500).optional(),
  searchAttempts: z.number().int().min(0).max(1000).optional(),
});

// Message metadata schema
export const messageMetadataSchema = z.object({
  inputTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
  latencyMs: z.number().int().min(0).optional(),
}).passthrough();

// Run metadata schema
export const runMetadataSchema = z.object({
  toolCalls: z
    .array(
      z.object({
        toolName: z.string(),
        toolCallId: z.string(),
        args: z.unknown(),
        result: z.unknown(),
      }),
    )
    .optional(),
  stepCount: z.number().int().min(1).optional(),
}).passthrough();

// API request schema for chat endpoint.
// UI transport sends `messages`; the legacy text client sends `content`.
// Card edits ride along on the existing chat request body: every send persists
// the current card values to the staged proposal before the model runs, which
// is what makes chat revision and manual editing compose instead of
// clobbering each other.
// Ephemeral file attachments ride along the same way, as data URLs (never as
// message parts, so history never re-sends bytes). One file per message on
// this anonymous surface.
const agentChatAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(160),
  mediaType: z.string().trim().max(160).default(""),
  dataUrl: z.string().min(1).max(4_000_000),
});

export const agentChatRequestSchema = z
  .object({
    sessionToken: z.string().min(1, "Session token is required"),
    content: z.string().min(1, "Message content is required").max(2000, "Message too long").optional(),
    messages: z.array(z.unknown()).min(1).optional(),
    proposedInquiryValues: createInquiryParamsSchema.partial().optional(),
    attachments: z.array(agentChatAttachmentSchema).max(1).optional(),
  })
  .refine((value) => value.content ?? value.messages, {
    message: "Message content is required",
  });

// Approval / discard request schemas (authorised by session token, not auth).
export const approveProposalRequestSchema = z.object({
  sessionToken: z.string().min(1, "Session token is required"),
  values: createInquiryParamsSchema,
  proposalId: z.string().min(1).optional(),
});

export const discardProposalRequestSchema = z.object({
  sessionToken: z.string().min(1, "Session token is required"),
  proposalId: z.string().min(1).optional(),
});

// Session creation input schema
export const createSessionInputSchema = z.object({
  businessId: z.string().min(1, "Business ID is required"),
  metadata: sessionMetadataSchema.optional(),
});

// Add message input schema
export const addMessageInputSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  role: z.enum(["user", "assistant", "tool", "system"]),
  content: z.string().min(1, "Message content is required"),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  metadata: messageMetadataSchema.optional(),
});

// Update session state input schema
export const updateSessionStateInputSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  state: qualificationStateSchema,
});

// Complete session input schema
export const completeSessionInputSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  inquiryId: z.string().min(1, "Inquiry ID is required"),
});

// Request handoff input schema
export const requestHandoffInputSchema = z.object({
  sessionId: z.string().min(1, "Session ID is required"),
  reason: z.string().min(1, "Handoff reason is required"),
  recommendation: z.string().optional(),
});

// Start run input schema
export const startRunInputSchema = z.object({
  businessId: z.string().min(1, "Business ID is required"),
  sessionId: z.string().min(1, "Session ID is required"),
  model: z.string().min(1, "Model is required"),
  provider: z.string().min(1, "Provider is required"),
  metadata: runMetadataSchema.optional(),
});

// Update run input schema
export const updateRunInputSchema = z.object({
  runId: z.string().min(1, "Run ID is required"),
  status: z.enum(["running", "completed", "failed"]).optional(),
  inputTokens: z.number().int().min(0).optional(),
  outputTokens: z.number().int().min(0).optional(),
  estimatedCostCents: z.number().min(0).optional(),
  error: z.string().optional(),
  completedAt: z.date().optional(),
  metadata: runMetadataSchema.optional(),
});
// Tool parameter schemas

// Search knowledge tool
export const searchKnowledgeParamsSchema = z.object({
  query: z.string().min(1, "Search query is required").max(500, "Query too long"),
});

// Get business info tool (no parameters)
export const getBusinessInfoParamsSchema = z.object({});

// Get services tool (no parameters)
export const getServicesParamsSchema = z.object({});

// Request human handoff tool
export const requestHumanHandoffParamsSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  customerMessage: z.string().optional(),
});
