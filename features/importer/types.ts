export type ImporterDestination = "pricing";

export type ImporterQuoteLibraryLineItem = {
  draftId: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
};

export type ImporterQuoteLibraryEntry = {
  draftId: string;
  kind: "block" | "package";
  name: string;
  description: string;
  items: ImporterQuoteLibraryLineItem[];
};

export type ImporterPlanContext = {
  /** Total items already saved for this business. */
  existingCount: number;
  /** Per-business limit for this destination, or null for unlimited. */
  limit: number | null;
  /** Slots still available to import (derived from limit - existingCount). */
  remainingSlots: number | null;
};

/**
 * Result returned by the AI/heuristic extractor before the user reviews.
 * The extractor only produces candidates; nothing is saved until commit.
 */
export type ImporterAnalyzeResult =
  | {
      ok: true;
      destination: "pricing";
      sourceName: string;
      entries: ImporterQuoteLibraryEntry[];
      warnings: string[];
      planContext: ImporterPlanContext;
    }
  | {
      ok: false;
      error: string;
    };

export type ImporterCommitResult = {
  created: number;
  skipped: number;
  error?: string;
};

export const importerMaxFileBytes = 5 * 1024 * 1024; // 5 MB
export const importerMaxExtractedChars = 20_000;
export const importerMaxQuoteLibraryEntries = 30;
export const importerMaxQuoteLibraryItemsPerEntry = 25;

export const importerAcceptedMimeTypes = [
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const importerAcceptedExtensions = [
  ".pdf",
  ".csv",
  ".txt",
  ".md",
  ".markdown",
] as const;

export const importerAcceptAttribute = [
  ...importerAcceptedMimeTypes,
  ...importerAcceptedExtensions,
].join(",");
