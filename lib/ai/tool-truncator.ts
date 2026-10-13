import "server-only";

/**
 * Tool Output Truncator
 *
 * Truncates tool execution outputs to stay within token budget limits.
 * Supports both plain text (line-boundary truncation) and JSON
 * (structural boundary truncation with bracket closing).
 */

const MAX_CONTENT_CHARS = 4000;

export interface TruncationResult {
  output: string;
  truncated: boolean;
  originalLength: number;
}

/**
 * Truncate tool output to fit within the 4000-character content limit.
 *
 * - Error-flagged outputs are never truncated.
 * - JSON outputs (starting with `{` or `[`) are truncated at the last complete
 *   key-value pair or array element boundary, with open brackets closed.
 * - Plain text outputs are truncated at the last complete line boundary.
 * - The truncation note is appended outside the 4000-char content limit.
 */
export function truncateToolOutput(
  output: string,
  isError: boolean
): TruncationResult {
  const originalLength = output.length;

  // Skip truncation for error-flagged outputs
  if (isError) {
    return { output, truncated: false, originalLength };
  }

  // No truncation needed if within limit
  if (originalLength <= MAX_CONTENT_CHARS) {
    return { output, truncated: false, originalLength };
  }

  const trimmed = output.trimStart();
  const isJson = trimmed.startsWith("{") || trimmed.startsWith("[");

  let truncatedContent: string;

  if (isJson) {
    truncatedContent = truncateJson(output);
  } else {
    truncatedContent = truncateText(output);
  }

  const note = `\n[truncated — showing first ${truncatedContent.length} chars of ${originalLength}]`;

  return {
    output: truncatedContent + note,
    truncated: true,
    originalLength,
  };
}

/**
 * Truncate plain text at the last complete line boundary at or before MAX_CONTENT_CHARS.
 */
function truncateText(output: string): string {
  const slice = output.slice(0, MAX_CONTENT_CHARS);
  const lastNewline = slice.lastIndexOf("\n");

  // If there's a newline, cut at that boundary for a complete line
  if (lastNewline > 0) {
    return output.slice(0, lastNewline);
  }

  // No newline found — return the full slice (single long line)
  return slice;
}

/**
 * Truncate JSON output at the last complete key-value pair or array element boundary,
 * then close any open brackets to produce valid JSON.
 */
function truncateJson(output: string): string {
  const slice = output.slice(0, MAX_CONTENT_CHARS);

  // Find the last structural boundary: a comma followed by a new element/key,
  // or the end of a complete value before a comma.
  const cutPoint = findJsonCutPoint(slice);
  const truncated = slice.slice(0, cutPoint);

  // Close any open brackets/braces
  return closeJsonBrackets(truncated);
}

/**
 * Find the best cut point in a JSON string slice — the position after the last
 * complete key-value pair or array element.
 *
 * We look for the last comma that separates complete elements, accounting for
 * strings (to avoid cutting inside string values).
 */
function findJsonCutPoint(slice: string): number {
  let lastSafeCut = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === ",") {
      // A comma at any depth marks the end of a complete element
      lastSafeCut = i;
    }
  }

  // If we found a safe cut point, cut just before the comma
  // (the content up to the comma is a complete element)
  if (lastSafeCut > 0) {
    return lastSafeCut;
  }

  // No comma found — return the full slice length
  return slice.length;
}

/**
 * Close any open JSON brackets/braces to produce valid JSON.
 * Scans the string tracking open brackets while respecting string literals.
 */
function closeJsonBrackets(partial: string): string {
  const openStack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < partial.length; i++) {
    const ch = partial[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      openStack.push("}");
    } else if (ch === "[") {
      openStack.push("]");
    } else if (ch === "}" || ch === "]") {
      // Pop matching opener
      if (openStack.length > 0 && openStack[openStack.length - 1] === ch) {
        openStack.pop();
      }
    }
  }

  // If we're inside an unclosed string, close it
  if (inString) {
    partial += '"';
  }

  // Close brackets in reverse order (innermost first)
  return partial + openStack.reverse().join("");
}
