/**
 * Business Instructions
 *
 * Owner-authored guidance ("we quote by square footage", "never promise
 * same-day service") shown to both AI surfaces: the public customer Agent and
 * the owner Assistant. Stored in `businesses.ai_agent_config.instructions`
 * alongside the agent tone — no dedicated column.
 *
 * The value is capped in characters so a long entry can never blow a surface's
 * token budget: 1,000 characters is roughly 250 tokens, small next to the
 * system-prompt and tool-schema overhead both surfaces already measure.
 */

export const businessInstructionsMaxLength = 1000;

/**
 * Normalize an owner-authored `ai_agent_config.instructions` value.
 *
 * The value is owner-authored guidance, not customer input: it is placed in
 * the instruction position of both AI surfaces by design. It is normalized
 * and length-capped here so a long entry can never blow a surface's token
 * budget — 1,000 characters is roughly 250 tokens, small next to the
 * system-prompt and tool-schema overhead both surfaces already measure.
 *
 * Returns `null` when there is nothing usable, so callers can omit the whole
 * prompt block rather than emitting an empty one.
 */
export function normalizeBusinessInstructions(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\r\n?/g, "\n").trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(0, businessInstructionsMaxLength);
}
