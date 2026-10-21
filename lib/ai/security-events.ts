import "server-only";

import { db } from "@/lib/db/client";
import { aiSecurityEvents } from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

// ---------------------------------------------------------------------------
// AI Security Events Logger
//
// Records AI security events (injection detection, rejection, output
// redaction) in the ai_security_events table. Failures are swallowed with a
// console.error — logging must never break the caller's turn — but the
// insert is awaited by the caller so a serverless runtime cannot freeze the
// instance before the audit row is written.
// ---------------------------------------------------------------------------

export type AiSecurityEventType =
  | "injection_detected"
  | "injection_rejected"
  | "output_redacted"
  | "conversation_locked"
  | "canary_leak_detected";

export type LogAiSecurityEventParams = {
  eventType: AiSecurityEventType;
  patternMatched: string;
  userId?: string | null;
  businessId?: string | null;
  rawInput: string;
};

/**
 * Computes SHA-256 hash of the raw input text.
 * Used to store a fingerprint without persisting raw user content.
 */
async function hashInput(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Logs an AI security event to the database. Never throws — a failed write
 * only reaches the console. The returned promise is awaited by the callers so
 * the audit row is not lost when the runtime freezes the instance right after
 * the response is returned.
 */
export async function logAiSecurityEvent(
  params: LogAiSecurityEventParams,
): Promise<void> {
  const { eventType, patternMatched, userId, businessId, rawInput } = params;

  try {
    const id = newEntityId();
    const inputHash = await hashInput(rawInput);

    await db.insert(aiSecurityEvents).values({
      id,
      eventType,
      patternMatched,
      userId: userId ?? null,
      businessId: businessId ?? null,
      inputHash,
    });
  } catch (error) {
    console.error("[ai-security-events] Failed to log event:", error);
  }
}
