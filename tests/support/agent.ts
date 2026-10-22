import { createAgentSession, loadSessionByToken } from "@/features/agent/session-service";
import type {
  AgentToolContext,
  QualificationState,
} from "@/features/agent/types";

/**
 * Creates an active agent session for a business.
 * Returns the public token for the created session.
 */
export async function createActiveAgentSession(businessId: string) {
  const result = await createAgentSession({ businessId });
  return {
    sessionId: result.sessionId,
    publicToken: result.publicToken,
    expiresAt: result.expiresAt,
  };
}

/**
 * Invokes an AI SDK tool's `execute` handler (the tool wrapper keeps the raw
 * execute function) and asserts the plain-object result type used by tests.
 * Tools are typed to potentially stream their output, but ours use object
 * outputs only.
 */
export async function runAgentTool<TOutput>(
  agentTool: { execute?: (input: never, options: never) => unknown },
  params: unknown,
  options: unknown,
): Promise<TOutput> {
  const execute = agentTool.execute;

  if (!execute) {
    throw new Error("Tool does not expose an execute handler.");
  }

  const result = await (
    execute as (input: unknown, options: unknown) => unknown
  )(params, options);

  if (
    result !== null &&
    typeof result === "object" &&
    Symbol.asyncIterator in result
  ) {
    throw new Error("Unexpected streaming tool result in test.");
  }

  return result as TOutput;
}

/**
 * Builds an AgentToolContext from a real session (mirrors what the
 * orchestrator constructs) so server-side tools can be exercised against
 * actual DB rows. Optionally overrides the qualification state.
 */
export async function createAgentToolContext(
  publicToken: string,
  state?: QualificationState,
): Promise<AgentToolContext> {
  const sessionData = await loadSessionByToken(publicToken);

  if (!sessionData) {
    throw new Error("Session not found");
  }

  const { business, state: sessionState, id: sessionId } = sessionData;

  return {
    sessionId,
    businessId: business.id,
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      plan: business.plan,
      shortDescription: business.shortDescription,
      contactEmail: business.contactEmail,
      inquiryFormConfig: business.inquiryFormConfig,
    },
    state: state ?? (sessionState as QualificationState),
  };
}