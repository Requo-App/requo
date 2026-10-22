/**
 * Agent Tool Types
 *
 * Type definitions for tool context and execution.
 */

import type { AgentToolContext } from "@/features/agent/types";

/**
 * Tool execution context passed to all tools.
 * Pre-validated by the orchestrator, never from user input or LLM output.
 */
export type { AgentToolContext };
