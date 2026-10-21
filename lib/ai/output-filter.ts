/**
 * AI Output Filter
 *
 * Detects and redacts system prompt leakage, internal instruction disclosure,
 * and sensitive configuration details from AI-generated responses.
 *
 * Fail-closed on error: the output is redacted rather than returned
 * uninspected, because callers persist what this returns.
 */

export interface OutputFilterResult {
  status: "clean" | "redacted";
  output: string;
  redactedPatterns: string[];
}

const REDACTION_PLACEHOLDER = "[REDACTED]";

/** Upper bound for regex inspection to avoid catastrophic backtracking on huge outputs. */
const MAX_FILTER_INSPECTION_CHARS = 50_000;

/**
 * Patterns that indicate internal instruction leakage in AI output.
 * These detect when the AI model is revealing its system prompt or configuration.
 */
const LEAKAGE_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // Direct system prompt disclosure
  {
    pattern:
      /(?:my|the)\s+system\s+prompt\s+(?:is|says|states|instructs|contains|reads)/i,
    name: "system_prompt_disclosure",
  },
  {
    pattern:
      /(?:my|the)\s+(?:internal\s+)?instructions?\s+(?:are|say|state|tell|include)/i,
    name: "instruction_disclosure",
  },
  {
    pattern: /(?:I\s+(?:was|am)\s+(?:instructed|told|programmed|configured)\s+to)/i,
    name: "instruction_disclosure",
  },
  {
    pattern:
      /(?:as\s+(?:an?\s+)?AI\s+assistant,?\s+my\s+instructions?\s+(?:are|include|say))/i,
    name: "instruction_disclosure",
  },
  {
    pattern: /(?:here(?:'s|\s+is)\s+my\s+(?:system\s+)?prompt)/i,
    name: "system_prompt_disclosure",
  },
  {
    pattern:
      /(?:the\s+(?:system\s+)?prompt\s+(?:I\s+(?:was\s+)?given|provided\s+to\s+me))/i,
    name: "system_prompt_disclosure",
  },
  // Configuration detail leakage
  {
    pattern: /(?:my\s+(?:API|api)\s+key\s+is\s+\S+|(?:API|api)[_-]?key\s*[:=]\s*\S+)/i,
    name: "config_leakage",
  },
  {
    pattern:
      /(?:(?:OPENAI|GROQ|OPENROUTER|NVIDIA|GOOGLE)[_-]?(?:API[_-]?KEY|SECRET|TOKEN)\s*[:=]\s*\S+)/i,
    name: "config_leakage",
  },
  {
    pattern: /(?:(?:DATABASE|DB|SUPABASE|REDIS)[_-]?(?:URL|URI|PASSWORD|SECRET)\s*[:=]\s*\S+)/i,
    name: "config_leakage",
  },
  // Internal role/persona revelation
  {
    pattern:
      /(?:I\s+(?:was|am)\s+(?:set\s+up|configured|designed)\s+(?:as|with|to\s+be)\s+(?:a\s+)?(?:system|internal|hidden))/i,
    name: "role_revelation",
  },
];

/**
 * Escapes a string for use in a RegExp, handling special characters.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes whitespace in a string for flexible matching.
 * Collapses multiple spaces/newlines into a single space.
 */
function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Filters AI output to redact system prompt leakage and sensitive information.
 *
 * Strategy:
 * 1. Check for canary token presence (indicates full system prompt leak)
 * 2. Check for exact or near-exact matches of system prompt fragments
 * 3. Check for common leakage patterns indicating the AI is revealing internals
 * 4. Redact matches while preserving non-leaked content
 *
 * On error, returns original output unchanged (fail-open for UX).
 */
export function filterAiOutput(
  output: string,
  systemPromptFragments: string[],
  options?: { canaryToken?: string },
): OutputFilterResult {
  try {
    if (!output || output.trim().length === 0) {
      return { status: "clean", output: output || "", redactedPatterns: [] };
    }

    // Cap inspection input for performance; the full output is still
    // returned when clean. Over-long outputs are inspected on their head —
    // a leak in the head is still caught, and the cap prevents ReDoS.
    const inspectionTarget =
      output.length > MAX_FILTER_INSPECTION_CHARS
        ? output.slice(0, MAX_FILTER_INSPECTION_CHARS)
        : output;

    let filteredOutput = output;
    const redactedPatterns: string[] = [];

    // 0. Check for canary token — if present, the entire response is compromised
    if (options?.canaryToken && inspectionTarget.includes(options.canaryToken)) {
      console.warn(
        "[output-filter] Canary token detected in model output; redacting entire response.",
      );
      redactedPatterns.push("canary_leak_detected");
      filteredOutput = "[REDACTED — system prompt leak detected]";
      return {
        status: "redacted",
        output: filteredOutput,
        redactedPatterns,
      };
    }

    // 1. Check for system prompt fragment matches
    // Only match fragments of meaningful length to avoid false positives
    const meaningfulFragments = systemPromptFragments.filter(
      (f) => f && f.trim().length >= 8
    );

    for (const fragment of meaningfulFragments) {
      const normalizedFragment = normalizeWhitespace(fragment);
      // Build a regex that allows flexible whitespace between words
      const words = normalizedFragment.split(" ").map(escapeRegExp);
      const flexiblePattern = new RegExp(words.join("\\s+"), "gi");

      if (flexiblePattern.test(inspectionTarget)) {
        redactedPatterns.push("system_prompt_fragment");
        // Reset lastIndex and replace
        flexiblePattern.lastIndex = 0;
        filteredOutput = filteredOutput.replace(
          flexiblePattern,
          REDACTION_PLACEHOLDER
        );
      }
    }

    // 2. Check for leakage patterns
    for (const { pattern, name } of LEAKAGE_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(inspectionTarget)) {
        redactedPatterns.push(name);
        pattern.lastIndex = 0;
        filteredOutput = filteredOutput.replace(pattern, REDACTION_PLACEHOLDER);
      }
    }

    if (redactedPatterns.length > 0) {
      return {
        status: "redacted",
        output: filteredOutput,
        redactedPatterns: Array.from(new Set(redactedPatterns)),
      };
    }

    return { status: "clean", output, redactedPatterns: [] };
  } catch (error) {
    // Fail-closed for safety: callers persist `output`, so returning the raw
    // text uninspected would store a potential leak. Return a redaction
    // placeholder and warn loudly; callers should also emit a security event.
    console.warn(
      "[output-filter] Filtering failed, redacting output as a precaution:",
      error instanceof Error ? error.message : error,
    );
    return {
      status: "redacted",
      output: "[REDACTED — output inspection failed]",
      redactedPatterns: ["filter_error"],
    };
  }
}
