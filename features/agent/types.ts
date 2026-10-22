/**
 * Agent Types
 *
 * Type definitions for the conversational inquiry collection agent.
 */

import type { agentSessions, agentMessages, agentRuns } from "@/lib/db/schema/agent";

// Database row types
export type AgentSession = typeof agentSessions.$inferSelect;
export type AgentMessage = typeof agentMessages.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;

// Session status
export type SessionStatus = "active" | "completed" | "human_handoff" | "abandoned";

// Message role
export type MessageRole = "user" | "assistant" | "tool" | "system";

// Run status
export type RunStatus = "running" | "completed" | "failed";

// Agent tone options
export type AgentTone = "friendly" | "professional" | "casual";

// Agent configuration (stored in businesses.ai_agent_config)
export type AgentConfig = {
  tone?: AgentTone;
  /** Owner-authored guidance shared with the public Agent and owner Assistant. */
  instructions?: string;
  handoffTriggers?: {
    maxSearchAttempts?: number;
    keywords?: string[];
  };
};

// Qualification state (stored in session.state)
export type QualificationState = {
  collected: Record<string, boolean>; // Which fields have been collected
  values: Record<string, string | null>; // The actual values
  missing: string[]; // Which fields are still needed
};

/**
 * A Proposed Inquiry: the structured result of Qualification, put to the
 * prospective customer (visitor) for approval before it becomes an Inquiry.
 * Staged in the Agent Session's existing state column alongside Qualification
 * data. A session holds at most one — a revision supersedes rather than
 * versions. No schema migration.
 */
export type ProposedInquiryStatus =
  | "pending"
  | "sending"
  | "approved"
  | "discarded";

/**
 * A proposal that has been consumed for sending but whose Inquiry has not
 * been created yet. The visitor can retry it once the window below elapses.
 */
export const AGENT_PROPOSAL_SENDING_STALE_MS = 2 * 60 * 1000;

export type ProposedInquiry = {
  id: string; // identifies this proposal for exactly-once consumption
  values: {
    customerName: string;
    customerEmail?: string | null;
    customerContactMethod: string;
    customerContactHandle: string;
    serviceSlug: string;
    details: string;
    budgetText?: string;
    requestedDeadline?: string;
    additionalFields?: Record<string, unknown>;
  };
  proposedAt: string;
  status: ProposedInquiryStatus;
  inquiryId?: string; // set once approved
  /** Set while the Inquiry is being created; used to reclaim a stale send. */
  sendingAt?: string;
};

/** Full session state: Qualification plus the single staged proposal. */
export type AgentSessionState = QualificationState & {
  proposedInquiry?: ProposedInquiry | null;
};

// Session metadata
export type SessionMetadata = {
  userAgent?: string;
  ipAddress?: string;
  handoffReason?: string;
  handoffRecommendation?: string;
  searchAttempts?: number;
  [key: string]: unknown;
};

// Message metadata
export type MessageMetadata = {
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  [key: string]: unknown;
};

// Run metadata
export type RunMetadata = {
  toolCalls?: Array<{
    toolName: string;
    toolCallId: string;
    args: unknown;
    result: unknown;
  }>;
  stepCount?: number;
  [key: string]: unknown;
};

// Session creation result
export type SessionCreateResult = {
  sessionId: string;
  publicToken: string;
  expiresAt: Date;
};

// Agent run context for tools
export type AgentToolContext = {
  sessionId: string;
  businessId: string;
  business: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    shortDescription: string | null;
    contactEmail: string | null;
    inquiryFormConfig: unknown;
  };
  state: QualificationState;
};

// Tool execution result types
export type ToolResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// Search knowledge tool result
export type SearchKnowledgeResult = {
  found: boolean;
  results?: Array<{
    content: string;
    relevance: number;
    source?: string;
  }>;
  message?: string;
};

// Get business info result
export type BusinessInfoResult = {
  name: string;
  description?: string;
  contact?: string;
  services?: string[];
};

// Get services result
export type ServicesResult = {
  services: Array<{
    value: string;
    label: string;
    description?: string;
    highlights?: string[];
    url?: string;
  }>;
};

// Create inquiry result
export type CreateInquiryResult = {
  inquiryId: string;
  message: string;
};

// Request handoff result
export type RequestHandoffResult = {
  handoffRequested: true;
  message: string;
};
