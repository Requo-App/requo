/**
 * AI Input Sanitizer
 *
 * Detects and neutralizes prompt injection attempts in user input before it
 * reaches the AI provider. Supports per-conversation lockout via Cache Layer.
 *
 * Processing pipeline:
 * 1. (If conversationId) Check injection counter — lock if >= 3
 * 2. Strip zero-width characters (U+200B, U+200C, U+200D, U+FEFF, U+00AD)
 * 3. Apply NFKC normalization (maps homoglyphs to ASCII equivalents)
 * 4. Execute pattern matching against the normalized result
 * 5. (If conversationId) Increment counter on "rejected" or "sanitized"
 *
 * Performance target: <5ms per input for pattern matching (cache ops are async).
 */

import { cacheLayer } from "@/lib/ai/cache-layer";
import { logAiSecurityEvent } from "@/lib/ai/security-events";

export interface SanitizationResult {
  status: "clean" | "sanitized" | "rejected" | "locked";
  /**
   * The sanitized single-field output. For callers that only have one piece
   * of text this is the content; `title`/`content` carry the split fields.
   */
  output: string;
  /** Sanitized title, when the caller supplied one. */
  title?: string;
  /** Sanitized content, when the caller supplied one. */
  content?: string;
  patterns: string[]; // matched patterns if any
}

// ---------------------------------------------------------------------------
// Unicode Normalization
// ---------------------------------------------------------------------------

/**
 * Zero-width characters to strip before any further processing.
 * U+200B Zero Width Space
 * U+200C Zero Width Non-Joiner
 * U+200D Zero Width Joiner
 * U+FEFF Byte Order Mark / Zero Width No-Break Space
 * U+00AD Soft Hyphen
 */
const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\uFEFF\u00AD]/g;

/**
 * The maximum number of characters the sanitizer inspects. The output path
 * caps its inspection for the same reason: the rejection patterns are the
 * request path's cost, and an unbounded body makes that cost unbounded too.
 */
export const MAX_SANITIZE_INPUT_CHARS = 20_000;

/**
 * Normalizes input by stripping zero-width characters and applying NFKC
 * normalization. NFKC maps Cyrillic homoglyphs and other compatibility
 * characters to their canonical ASCII equivalents.
 *
 * Exported for reuse by sanitizeMemoryContent and other consumers.
 */
export function normalizeInput(input: string): string {
  // Step 1: Strip zero-width characters
  const stripped = input.replace(ZERO_WIDTH_REGEX, "");
  // Step 2: Apply NFKC normalization
  return stripped.normalize("NFKC");
}

/**
 * High-confidence injection patterns that trigger immediate rejection.
 * These are normalized to case-insensitive matching with flexible whitespace.
 * Pattern matching operates on the NFKC-normalized form of the input.
 */
const REJECTION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // Direct instruction override attempts (English)
  {
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|context|rules?|guidelines?)/i,
    name: "instruction_override",
  },
  {
    pattern: /disregard\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|context|rules?|guidelines?)/i,
    name: "instruction_override",
  },
  {
    pattern: /forget\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|context|rules?|guidelines?)/i,
    name: "instruction_override",
  },
  // French injection patterns
  {
    pattern: /ignor(?:ez|er?)\s+(?:toutes?\s+)?(?:les\s+)?instructions?\s+pr[ée]c[ée]dentes?/i,
    name: "instruction_override_fr",
  },
  {
    pattern: /oubli(?:ez|er?)\s+(?:toutes?\s+)?(?:les\s+)?instructions?\s+pr[ée]c[ée]dentes?/i,
    name: "instruction_override_fr",
  },
  {
    pattern: /ne\s+tene[zr]\s+pas\s+compte\s+des?\s+instructions?\s+pr[ée]c[ée]dentes?/i,
    name: "instruction_override_fr",
  },
  // Spanish injection patterns
  {
    pattern: /ignora(?:r?)?\s+(?:todas?\s+)?(?:las\s+)?instrucciones?\s+anteriores?/i,
    name: "instruction_override_es",
  },
  {
    pattern: /olvida(?:r?)?\s+(?:todas?\s+)?(?:las\s+)?instrucciones?\s+anteriores?/i,
    name: "instruction_override_es",
  },
  {
    pattern: /no\s+(?:tengas?\s+en\s+cuenta|hagas?\s+caso\s+(?:a|de))\s+(?:las\s+)?instrucciones?\s+anteriores?/i,
    name: "instruction_override_es",
  },
  // German injection patterns
  {
    pattern: /ignorier(?:e|en)?\s+(?:alle\s+)?(?:vorherige[n]?|fr[üu]here[n]?)\s+(?:Anweisungen|Instruktionen|Regeln)/i,
    name: "instruction_override_de",
  },
  {
    pattern: /vergiss\s+(?:alle\s+)?(?:vorherige[n]?|fr[üu]here[n]?)\s+(?:Anweisungen|Instruktionen|Regeln)/i,
    name: "instruction_override_de",
  },
  {
    pattern: /missacht(?:e|en)?\s+(?:alle\s+)?(?:vorherige[n]?|fr[üu]here[n]?)\s+(?:Anweisungen|Instruktionen|Regeln)/i,
    name: "instruction_override_de",
  },
  // Role-switching attempts
  {
    pattern: /you\s+are\s+now\s+(?:a|an|the)\b/i,
    name: "role_switch",
  },
  {
    pattern: /act\s+as\s+(?:a|an|the|if)\b/i,
    name: "role_switch",
  },
  {
    pattern: /pretend\s+(?:you(?:'re|\s+are)\s+|to\s+be\s+)/i,
    name: "role_switch",
  },
  {
    pattern: /from\s+now\s+on\s+you\s+(?:are|will|should|must)/i,
    name: "role_switch",
  },
  {
    pattern: /switch(?:ing)?\s+(?:to|into)\s+(?:\w+\s+)?mode/i,
    name: "role_switch",
  },
  // System prompt extraction
  {
    pattern: /(?:reveal|show|display|print|output|repeat|echo)\s+(?:your\s+)?(?:system\s+)?prompt/i,
    name: "prompt_extraction",
  },
  {
    pattern: /what\s+(?:is|are)\s+your\s+(?:system\s+)?(?:instructions?|rules?|prompt|guidelines?)/i,
    name: "prompt_extraction",
  },
  {
    pattern: /(?:tell|give)\s+me\s+your\s+(?:system\s+)?(?:instructions?|rules?|prompt|guidelines?)/i,
    name: "prompt_extraction",
  },
  // Direct system prompt manipulation
  {
    pattern: /\bsystem\s*(?::|\s+)prompt\b/i,
    name: "system_prompt_injection",
  },
  {
    pattern: /\[?\s*system\s*\]?\s*(?::|\n)/i,
    name: "system_prompt_injection",
  },
  // Delimiter injection — XML-style tags commonly used to frame system instructions
  {
    pattern: /<\s*(?:system|instruction|prompt|context|rule|admin|internal|hidden|secret)\s*>/i,
    name: "delimiter_injection",
  },
  {
    pattern: /<\s*\/\s*(?:system|instruction|prompt|context|rule|admin|internal|hidden|secret)\s*>/i,
    name: "delimiter_injection",
  },
  // Encoded variants — base64 "ignore" prefix, URL-encoded patterns
  {
    pattern: /aWdub3Jl/i, // base64 for "ignore"
    name: "encoded_injection",
  },
  {
    pattern: /%69%67%6[eE]%6[fF]%72%65/i, // URL-encoded "ignore"
    name: "encoded_injection",
  },
  {
    pattern: /&#(?:105|x69);&#(?:103|x67);&#(?:110|x6[eE]);&#(?:111|x6[fF]);&#(?:114|x72);&#(?:101|x65);/i, // HTML-encoded "ignore"
    name: "encoded_injection",
  },
];

/**
 * Patterns that trigger sanitization (removal) rather than outright rejection.
 * These are lower-confidence indicators that might appear in legitimate input
 * but should be neutralized.
 */
const SANITIZATION_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // Triple backtick blocks that might frame injected instructions
  {
    pattern: /```\s*(?:system|instruction|prompt|admin|internal)\b[\s\S]*?```/gi,
    name: "code_block_injection",
  },
  // Markdown-style heading attempts to inject instructions
  {
    pattern: /^#{1,3}\s*(?:system|instruction|new\s+instructions?|override)/gim,
    name: "heading_injection",
  },
  // Separator-based injection (----, ====, etc. followed by instruction keywords)
  //
  // The separator run is bounded and anchored to a line start: an unbounded
  // `[-=]{4,}` retries the tail of the pattern at every position, so a long
  // run of dashes made the match quadratic — attacker-controlled work with
  // no bound, on the request path.
  {
    pattern: /(?:^|\n)[-=]{4,16}[ \t]*\n[ \t]*(?:new\s+)?(?:system|instructions?|rules?|prompt)\s*(?::|\n)/gim,
    name: "separator_injection",
  },
];

/**
 * Sanitizes memory content (title + content) before persistence.
 *
 * Prevents RAG poisoning by scanning both title and content fields for
 * injection patterns. Uses the same normalization pipeline as chat input.
 *
 * Returns:
 * - `rejected` if high-confidence injection patterns are found in title or content
 * - `sanitized` if low-confidence patterns were stripped (logs "memory_sanitized" event)
 * - `clean` if no patterns were detected
 */
export function sanitizeMemoryContent(
  title: string,
  content: string,
): SanitizationResult {
  try {
    // Normalize both fields: strip zero-width chars + NFKC normalization
    const normalizedTitle = normalizeInput(title || "");
    const normalizedContent = normalizeInput(content || "");

    const matchedPatterns: string[] = [];

    // Check rejection patterns against both normalized title and content
    for (const { pattern, name } of REJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(normalizedTitle)) {
        matchedPatterns.push(name);
      }
      pattern.lastIndex = 0;
      if (pattern.test(normalizedContent)) {
        if (!matchedPatterns.includes(name)) {
          matchedPatterns.push(name);
        }
      }
    }

    if (matchedPatterns.length > 0) {
      return {
        status: "rejected",
        output: "",
        title: "",
        content: "",
        patterns: Array.from(new Set(matchedPatterns)),
      };
    }

    // Check sanitization patterns against both normalized title and content
    let sanitizedTitle = normalizedTitle;
    let sanitizedContent = normalizedContent;
    const sanitizedPatterns: string[] = [];

    for (const { pattern, name } of SANITIZATION_PATTERNS) {
      // Check and strip from title
      pattern.lastIndex = 0;
      if (pattern.test(sanitizedTitle)) {
        if (!sanitizedPatterns.includes(name)) {
          sanitizedPatterns.push(name);
        }
        pattern.lastIndex = 0;
        sanitizedTitle = sanitizedTitle.replace(pattern, "");
      }

      // Check and strip from content
      pattern.lastIndex = 0;
      if (pattern.test(sanitizedContent)) {
        if (!sanitizedPatterns.includes(name)) {
          sanitizedPatterns.push(name);
        }
        pattern.lastIndex = 0;
        sanitizedContent = sanitizedContent.replace(pattern, "");
      }
    }

    if (sanitizedPatterns.length > 0) {
      // Log security event for memory sanitization
      console.warn(
        `[input-sanitizer] memory_sanitized: patterns stripped from memory content`,
        { patterns: sanitizedPatterns },
      );

      return {
        status: "sanitized",
        output: sanitizedContent.trim(),
        title: sanitizedTitle.trim(),
        content: sanitizedContent.trim(),
        patterns: Array.from(new Set(sanitizedPatterns)),
      };
    }

    return {
      status: "clean",
      output: normalizedContent,
      title: normalizedTitle,
      content: normalizedContent,
      patterns: [],
    };
  } catch {
    // Fail-closed: reject the content on unexpected errors
    return {
      status: "rejected",
      output: "",
      title: "",
      content: "",
      patterns: ["processing_error"],
    };
  }
}

export async function sanitizeAiInput(
  input: string,
  conversationId?: string,
): Promise<SanitizationResult> {
  // Reject oversized input before trimming, normalization, or pattern matching.
  // Returning a prefix would let importers silently extract partial documents.
  if (input && input.length > MAX_SANITIZE_INPUT_CHARS) {
    return {
      status: "rejected",
      output: "",
      title: "",
      content: "",
      patterns: ["input_truncated"],
    };
  }

  try {
    // Step 1: Check lockout counter if conversationId is provided
    if (conversationId) {
      try {
        const counter = await cacheLayer.get<number>(`inj:${conversationId}`);
        if (counter !== null && counter >= LOCKOUT_THRESHOLD) {
          return {
            status: "locked",
            output: "",
            title: "",
            content: "",
            patterns: ["conversation_locked"],
          };
        }
      } catch {
        // Cache Layer unavailable: skip lockout check, log warning
        console.warn(
          "[input-sanitizer] Failed to check lockout counter, skipping lockout check",
        );
      }
    }

    // Handle empty/null input
    if (!input || input.trim().length === 0) {
      return {
        status: "clean",
        output: input || "",
        title: "",
        content: input || "",
        patterns: [],
      };
    }

    // Normalize input: strip zero-width chars + NFKC normalization.
    const normalized = normalizeInput(input);

    const matchedPatterns: string[] = [];

    // Check rejection patterns against the normalized form
    for (const { pattern, name } of REJECTION_PATTERNS) {
      // Reset lastIndex for patterns with global flag
      pattern.lastIndex = 0;
      if (pattern.test(normalized)) {
        matchedPatterns.push(name);
      }
    }

    if (matchedPatterns.length > 0) {
      // Increment lockout counter on rejection
      if (conversationId) {
        await incrementLockoutCounter(conversationId);
      }
      return {
        status: "rejected",
        output: "",
        title: "",
        content: "",
        patterns: Array.from(new Set(matchedPatterns)),
      };
    }

    // Check sanitization patterns against the normalized form
    let sanitizedOutput = normalized;
    const sanitizedPatterns: string[] = [];

    for (const { pattern, name } of SANITIZATION_PATTERNS) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      if (pattern.test(sanitizedOutput)) {
        sanitizedPatterns.push(name);
        // Reset again before replace
        pattern.lastIndex = 0;
        sanitizedOutput = sanitizedOutput.replace(pattern, "");
      }
    }

    if (sanitizedPatterns.length > 0) {
      // Increment lockout counter on sanitization
      if (conversationId) {
        await incrementLockoutCounter(conversationId);
      }
      return {
        status: "sanitized",
        output: sanitizedOutput.trim(),
        title: "",
        content: sanitizedOutput.trim(),
        patterns: Array.from(new Set(sanitizedPatterns)),
      };
    }

    return {
      status: "clean",
      output: normalized,
      title: "",
      content: normalized,
      patterns: [],
    };
  } catch {
    // Catch unexpected errors (e.g., catastrophic backtracking)
    // Fail-closed: reject the input
    return {
      status: "rejected",
      output: "",
      title: "",
      content: "",
      patterns: ["processing_error"],
    };
  }
}

// ---------------------------------------------------------------------------
// Lockout Counter Helpers
// ---------------------------------------------------------------------------

const LOCKOUT_THRESHOLD = 3;
const LOCKOUT_TTL_SECONDS = 3600; // 1 hour

/**
 * Increments the per-conversation injection counter and logs a security event
 * when the lockout threshold is reached.
 */
async function incrementLockoutCounter(conversationId: string): Promise<void> {
  try {
    const newCount = await cacheLayer.increment(
      `inj:${conversationId}`,
      LOCKOUT_TTL_SECONDS,
    );

    if (newCount >= LOCKOUT_THRESHOLD) {
      await logAiSecurityEvent({
        eventType: "conversation_locked",
        patternMatched: "lockout_threshold_reached",
        rawInput: `conversationId:${conversationId}`,
      });
    }
  } catch {
    // Cache Layer unavailable: skip counter increment, log warning
    console.warn(
      "[input-sanitizer] Failed to increment lockout counter for conversation:",
      conversationId,
    );
  }
}
