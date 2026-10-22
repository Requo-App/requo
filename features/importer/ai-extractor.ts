import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";

import { env, isGeminiConfigured } from "@/lib/env";
import { EXTRACTION_MODEL_IDS } from "@/lib/ai/catalog";
import {
  getModelQuotaState,
  markModelExhausted,
  recordModelTokenUsageDetailed,
  recordModelUsage,
} from "@/lib/ai/capacity-selector";
import { filterAiOutput } from "@/lib/ai/output-filter";
import { getAiCanaryToken } from "@/lib/ai/canary";
import { sanitizeAiInput } from "@/lib/ai/input-sanitizer";
import type { ExtractedPayload } from "@/features/importer/extractors";
import type {
  ImporterDestination,
  ImporterPricingEntry,
  ImporterPricingLineItem,
} from "@/features/importer/types";
import {
  importerMaxPricingEntries,
  importerMaxPricingItemsPerEntry,
} from "@/features/importer/types";

// ---------------------------------------------------------------------------
// File Importer → AI Extractor
//
// This surface calls Gemini directly instead of going through
// `lib/ai/router.ts`, because extraction needs multimodal PDF input and a
// Gemini-only JSON response mode that the shared router does not carry.
//
// The deviation is bounded: the document is sanitised before it reaches the
// model, the response is filtered and validated, and the invocation is
// metered against the shared free-tier capacity counters like every other AI
// surface.
// ---------------------------------------------------------------------------

const GEMINI_TIMEOUT_MS = 30_000;

// Extraction models live in the unified catalog (`EXTRACTION_MODEL_IDS`) so
// they are covered by the drift check. The importer keeps its own provider
// client and retry loop (unifying it into the shared router is out of scope),
// but it still reads and writes the same free-tier capacity counters.

const PRICING_JSON_SHAPE = `{
  "entries": [
    {
      "kind": "block",
      "name": "Short name",
      "description": "Optional short description (may be omitted)",
      "items": [
        { "description": "Line item text", "quantity": 1, "unitPrice": "49.99" }
      ]
    }
  ],
  "warnings": ["Optional short warning strings"]
}`;

const PRICING_INSTRUCTIONS = [
  "You extract pricing from an uploaded document into reusable library entries.",
  "Return ONLY a JSON object matching this exact shape (no markdown fences, no prose):",
  PRICING_JSON_SHAPE,
  "Each entry's `kind` must be either `block` (entry has exactly one line item) or `package` (entry has multiple line items).",
  "Each line item has: `description`, `quantity` (positive integer, default 1), `unitPrice` (the price as a decimal amount, e.g. \"49.99\").",
  "Report `unitPrice` as the amount in the document's currency with no currency symbol and no thousands separator. The server converts it to cents, so never scale the number yourself.",
  "Strip currency symbols, commas, and spaces from prices before converting.",
  "If a quantity is not specified, use 1.",
  "If a row is a discount, tax, or subtotal, skip it and add a warning.",
  "If prices appear in multiple currencies, add a warning and use the primary currency.",
  "If you cannot determine a price for a row, skip it and add a warning.",
  "Use `package` when multiple items are grouped (e.g., a service tier, a bundle).",
  "Use `block` for standalone pricing items (e.g., a single service with one price).",
  `Return at most ${importerMaxPricingEntries} entries, each with at most ${importerMaxPricingItemsPerEntry} items.`,
  "Do not invent prices. Skip rows where the price is unclear.",
].join("\n");

type ExtractionInput = {
  destination: ImporterDestination;
  payload: ExtractedPayload;
};

/**
 * The shape the extractor may return. Validated with Zod before any value
 * is used: the response is model output and cannot be trusted to have the
 * shape it claims.
 */
const pricingExtractionSchema = z.object({
  entries: z
    .array(
      z.object({
        kind: z.enum(["block", "package"]).optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        items: z
          .array(
            z.object({
              description: z.string().optional(),
              quantity: z.union([z.number(), z.string()]).optional(),
              unitPrice: z.union([z.string(), z.number()]).optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  warnings: z.array(z.string()).optional(),
});

type PricingResponse = z.infer<typeof pricingExtractionSchema>;

export type AiExtractionResult =
  | {
      ok: true;
      destination: "pricing";
      entries: ImporterPricingEntry[];
      warnings: string[];
    }
  | { ok: false; error: string };

function getGeminiProvider() {
  if (!isGeminiConfigured || !env.GEMINI_API_KEY) {
    return null;
  }

  return createGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
  });
}

function buildUserContent(payload: ExtractedPayload): Array<{ type: "text"; text: string } | { type: "file"; data: string; mediaType: string }> {
  if (payload.kind === "pdf") {
    return [
      {
        type: "file",
        data: payload.base64,
        mediaType: "application/pdf",
      },
      {
        type: "text",
        text: `File name: ${payload.fileName}\nExtract structured data from this document as described by the system instructions.`,
      },
    ];
  }

  return [
    {
      type: "text",
      text: `File name: ${payload.fileName}\n\nDocument content:\n${payload.text}`,
    },
  ];
}

/**
 * Sanitise the document text before it reaches the model. An uploaded file
 * is untrusted content, exactly like a customer's message.
 */
async function sanitizeDocumentText(payload: ExtractedPayload): Promise<string | null> {
  if (payload.kind !== "text") {
    return "";
  }

  const sanitized = await sanitizeAiInput(payload.text);

  if (sanitized.status === "rejected" || sanitized.status === "locked") {
    return null;
  }

  return sanitized.output;
}

async function recordExtractionUsage(
  modelId: string,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
): Promise<void> {
  try {
    await recordModelUsage(modelId);
    const inputTokens = Math.max(0, usage?.inputTokens ?? 0);
    const outputTokens = Math.max(0, usage?.outputTokens ?? 0);
    if (inputTokens > 0 || outputTokens > 0) {
      await recordModelTokenUsageDetailed(modelId, {
        inputTokens,
        outputTokens,
      });
    }
  } catch {
    // Capacity bookkeeping must never fail an extraction.
  }
}

export async function aiExtractFromFile(
  input: ExtractionInput,
): Promise<AiExtractionResult> {
  const provider = getGeminiProvider();

  if (!provider) {
    return {
      ok: false,
      error:
        "The AI importer is temporarily unavailable. Please try again later.",
    };
  }

  const systemInstruction = PRICING_INSTRUCTIONS;
  const documentText = await sanitizeDocumentText(input.payload);
  if (documentText === null) {
    return {
      ok: false,
      error: "The document could not be processed. Try a smaller file without instructional text.",
    };
  }
  const userContent =
    input.payload.kind === "text"
      ? [
          {
            type: "text" as const,
            text: `File name: ${input.payload.fileName}\n\nDocument content:\n${documentText}`,
          },
        ]
      : buildUserContent(input.payload);

  let lastError: unknown = null;

  for (const modelId of EXTRACTION_MODEL_IDS) {
    const model = modelId.slice("google:".length);

    try {
      const quota = await getModelQuotaState(modelId);
      if (quota === "dead" || quota === "exhausted") {
        lastError = new Error(
          `The extraction model "${modelId}" has no free capacity.`,
        );
        continue;
      }
    } catch {
      // If the capacity cache is unavailable, let the provider be the
      // authority rather than failing the upload before it starts.
    }

    try {
      const result = await generateText({
        model: provider(model),
        system: systemInstruction,
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
        temperature: 0.1,
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });

      await recordExtractionUsage(modelId, result.usage);

      const text = result.text ?? "";

      if (!text.trim()) {
        lastError = new Error("Empty response from AI extractor.");
        continue;
      }

      // The response is model output: filter it and validate its shape before
      // any value is used.
      const filtered = filterAiOutput(text, [], {
        canaryToken: getAiCanaryToken(),
      });

      const parsed = tryParseJson(filtered.output);

      if (!parsed) {
        lastError = new Error("AI extractor returned non-JSON output.");
        continue;
      }

      const validation = pricingExtractionSchema.safeParse(parsed);

      if (!validation.success) {
        lastError = new Error("AI extractor returned an unexpected shape.");
        continue;
      }

      return normalisePricing(validation.data);
    } catch (error) {
      lastError = error;
      try {
        await markModelExhausted(modelId, error, { turnAborted: false });
      } catch {
        // Capacity bookkeeping must never fail an extraction.
      }
      console.warn(
        `[importer] Gemini extraction failed: model="${model}" message="${error instanceof Error ? error.message : String(error)}"`,
      );
    }
  }

  return {
    ok: false,
    error:
      lastError instanceof Error && lastError.message.toLowerCase().includes("timeout")
        ? "The document took too long to analyze. Try a smaller file."
        : "We couldn't analyze that file right now. Please try again in a moment.",
  };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Some models wrap JSON in ```json fences even when asked not to.
    const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/i);

    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }

    return null;
  }
}

function toDraftId(prefix: string, index: number): string {
  return `${prefix}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalisePricing(parsed: PricingResponse): AiExtractionResult {
  const rawEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const entries: ImporterPricingEntry[] = [];
  let droppedEntriesForCap = 0;
  let droppedItemsForCap = 0;

  for (let i = 0; i < rawEntries.length; i += 1) {
    const raw = rawEntries[i];
    const kind = raw.kind === "block" || raw.kind === "package" ? raw.kind : "block";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const description =
      typeof raw.description === "string" ? raw.description.trim() : "";

    if (!name) continue;

    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items: ImporterPricingLineItem[] = [];

    for (let j = 0; j < rawItems.length; j += 1) {
      const rawItem = rawItems[j];
      const itemDescription =
        typeof rawItem.description === "string" ? rawItem.description.trim() : "";

      if (!itemDescription) continue;

      if (items.length >= importerMaxPricingItemsPerEntry) {
        droppedItemsForCap += 1;
        continue;
      }

      const quantity = toPositiveInt(rawItem.quantity, 1);
      // The server owns the scale. The model reports the amount as written in
      // the document; a model that returned "1250" meaning 1250 cents used to
      // seed a price a hundred times too small into the library, where it
      // could later be auto-verified onto a quote.
      const unitPriceInCents = toCents(rawItem.unitPrice);

      if (unitPriceInCents === null) {
        continue;
      }

      items.push({
        draftId: toDraftId("p", j),
        description: itemDescription.slice(0, 400),
        quantity,
        unitPriceInCents,
      });
    }

    if (!items.length) continue;

    if (entries.length >= importerMaxPricingEntries) {
      droppedEntriesForCap += 1;
      continue;
    }

    const resolvedKind: "block" | "package" = items.length === 1 ? "block" : "package";

    entries.push({
      draftId: toDraftId("e", i),
      kind: kind === "package" && items.length === 1 ? "block" : resolvedKind,
      name: name.slice(0, 120),
      description: description.slice(0, 600),
      items,
    });
  }

  const warnings = extractWarnings(parsed.warnings);

  if (droppedEntriesForCap > 0) {
    warnings.unshift(
      `The file contained more entries than we can import at once. ${droppedEntriesForCap} additional pricing ${droppedEntriesForCap === 1 ? "entry was" : "entries were"} dropped. You can re-upload the remaining sections or add them manually.`,
    );
  }

  if (droppedItemsForCap > 0) {
    warnings.push(
      `Some entries had more line items than fit per entry. ${droppedItemsForCap} additional line ${droppedItemsForCap === 1 ? "item was" : "items were"} dropped.`,
    );
  }

  return {
    ok: true,
    destination: "pricing",
    entries,
    warnings,
  };
}

function extractWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((w) => (typeof w === "string" ? w.trim() : ""))
    .filter((w) => w.length > 0)
    .slice(0, 10);
}

/**
 * Convert a decimal amount from the document into cents.
 *
 * The model reports the amount as written ("49.99", "$1,250.00"); the server
 * decides the scale. Returns null when the amount cannot be read, and the
 * row is skipped rather than imported with a wrong price.
 */
function toCents(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;

    return Math.min(Math.round(value * 100), 100_000_000);
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.,-]/g, "").replace(/,/g, "");
    const parsed = Number.parseFloat(cleaned);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.min(Math.round(parsed * 100), 100_000_000);
    }
  }

  return null;
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);

    return rounded >= 1 ? Math.min(rounded, 100_000) : fallback;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));

    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(Math.round(parsed), 100_000);
    }
  }

  return fallback;
}

