/**
 * Assistant Types
 *
 * Type definitions for the owner-facing business operations assistant.
 */

/**
 * Owner assistant session context
 * Persisted in database (owner_assistant_sessions + owner_assistant_messages)
 */
export interface AssistantSession {
  sessionId: string; // Changed from conversationId for consistency
  businessId: string;
  userId: string;
  userRole: string;
  plan: string;
  title: string | null;
  state: {
    lastMentioned: LastMentionedEntities;
  };
  messages: Array<{
    role: string;
    content: string;
    toolName?: string | null;
    toolCallId?: string | null;
    id?: string;
    createdAt?: Date;
  }>; // Loaded from DB
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Last mentioned entities for conversation continuity
 */
export interface LastMentionedEntities {
  inquiryId?: string;
  quoteId?: string;
  customerId?: string; // Email, since customer is not a first-class entity
}

/**
 * Tool result types for structured UI rendering
 */
export type ToolResultType =
  | "inquiry_list"
  | "quote_list"
  | "customer_list"
  | "stats_summary"
  | "chart_data"
  | "knowledge_results"
  | "inquiry_created"
  | "quote_created"
  | "inquiry_updated"
  | "quote_sent"
  | "follow_up_scheduled"
  | "error"
  | "confirmation_required";

/**
 * Base tool result interface
 */
export interface BaseToolResult {
  type: ToolResultType;
  summary: string;
  data?: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Error result from tool execution
 */
export interface ErrorResult extends BaseToolResult {
  type: "error";
  error:
    | "PLAN_LIMIT"
    | "PERMISSION_DENIED"
    | "NOT_FOUND"
    | "VALIDATION_ERROR"
    | "RATE_LIMIT"
    | "INTERNAL_ERROR";
  message: string;
  details?: unknown;
  upgradeUrl?: string;
  retryable?: boolean;
}

/**
 * Confirmation required result (high-risk operations)
 */
export interface ConfirmationRequiredResult extends BaseToolResult {
  type: "confirmation_required";
  confirmationId: string;
  operation: string;
  parameters: Record<string, unknown>;
  confirmationPrompt: string;
  riskLevel: "high";
}

/**
 * Tool execution context
 * Contains resolved business and user info
 */
export interface ToolExecutionContext {
  businessId: string;
  userId: string;
  userRole: string;
  plan: string;
  session: AssistantSession;
}

/**
 * Tool metadata for authorization and gating
 */
export interface ToolMetadata {
  name: string;
  description: string;
  requiresConfirmation: boolean;
  riskLevel: "low" | "high";
  requiredPlan?: "pro" | "business";
  requiredFeature?: string;
  requiresPermission?: string;
}
