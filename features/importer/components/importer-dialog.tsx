"use client";

import { useId, useRef, useState, useTransition } from "react";
import { FileUp, Sparkles, X } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
} from "@/components/ui/responsive-overlay";
import { Spinner } from "@/components/ui/spinner";
import {
  ImporterQuoteLibraryReview,
  type QuoteLibraryDraft,
} from "@/features/importer/components/importer-quote-library-review";
import type {
  ImporterAnalyzeResult,
  ImporterCommitResult,
  ImporterPlanContext,
} from "@/features/importer/types";
import {
  importerAcceptAttribute,
  importerMaxFileBytes,
} from "@/features/importer/types";
import { cn } from "@/lib/utils";

type ImporterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  analyzeAction: (formData: FormData) => Promise<ImporterAnalyzeResult>;
  commitQuoteLibraryAction: (
    payload: { sourceName: string; entries: QuoteLibraryDraft[] },
  ) => Promise<ImporterCommitResult>;
};

type Step = "upload" | "analyzing" | "review";

type ReviewState = {
  destination: "pricing";
  sourceName: string;
  warnings: string[];
  entries: QuoteLibraryDraft[];
  planContext: ImporterPlanContext;
};

export function ImporterDialog({
  open,
  onOpenChange,
  analyzeAction,
  commitQuoteLibraryAction,
}: ImporterDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [isAnalyzing, startAnalyzing] = useTransition();
  const [isCommitting, startCommitting] = useTransition();
  // Increments each time the user tries to commit while over their plan limit.
  // Review components watch this to scroll the last over-limit item into view
  // and briefly pulse its red border.
  const [overLimitNonce, setOverLimitNonce] = useState(0);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClose(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }

    // Block close while committing to avoid losing user edits mid-save.
    if (isCommitting) return;

    onOpenChange(false);
    // Reset after the dialog animates closed.
    setTimeout(() => {
      setStep("upload");
      setFile(null);
      setReview(null);
    }, 200);
  }

  function handleFileSelect(selected: File | null) {
    if (!selected) {
      setFile(null);
      return;
    }

    if (selected.size > importerMaxFileBytes) {
      toast.error(
        `File is too large. Keep it under ${Math.round(importerMaxFileBytes / (1024 * 1024))} MB.`,
      );
      return;
    }

    setFile(selected);
  }

  function handleAnalyze() {
    if (!file) return;

    startAnalyzing(async () => {
      const formData = new FormData();

      formData.append("file", file);

      const result = await analyzeAction(formData);

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (!result.entries.length) {
        toast.error(
          "The AI didn't find any quote library entries to import from that file. Try a different file or add entries manually.",
        );
        return;
      }

      setReview({
        destination: "pricing",
        sourceName: result.sourceName,
        warnings: result.warnings,
        planContext: result.planContext,
        entries: result.entries.map((entry) => ({
          draftId: entry.draftId,
          kind: entry.kind,
          name: entry.name,
          description: entry.description,
          items: entry.items.map((item) => ({
            draftId: item.draftId,
            description: item.description,
            quantity: item.quantity,
            unitPriceInCents: item.unitPriceInCents,
          })),
        })),
      });
      setStep("review");
    });
  }

  function handleCommit() {
    if (!review) return;

    // Client-side pre-flight: if the current selection would exceed the plan
    // limit, show the red highlight UX and block the commit. Server still
    // enforces the same rule, but this is faster and prevents a wasted call.
    const selectedCount = getSelectedCount(review);

    if (isOverLimit(review, selectedCount)) {
      setOverLimitNonce((n) => n + 1);
      toast.error(buildOverLimitMessage(review, selectedCount));
      return;
    }

    startCommitting(async () => {
      const result = await commitQuoteLibraryAction({
        sourceName: review.sourceName,
        entries: review.entries,
      });

      if (result.error && result.created === 0) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.created === 1
          ? "1 quote library entry imported."
          : `${result.created} quote library entries imported.`,
        result.error ? { description: result.error } : undefined,
      );
      handleClose(false);
    });
  }

  const title = "Import quote library from file";
  const description =
    "Upload a price list and AI will extract quote library entries you can review before saving.";

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleClose}>
      <ResponsiveOverlayContent className="sm:max-w-3xl">
        <ResponsiveOverlayHeader>
          <ResponsiveOverlayTitle>{title}</ResponsiveOverlayTitle>
          <ResponsiveOverlayDescription>{description}</ResponsiveOverlayDescription>
        </ResponsiveOverlayHeader>

        <ResponsiveOverlayBody className="max-h-[65vh] overflow-y-auto">
          {step === "upload" ? (
            <UploadStep
              file={file}
              inputId={inputId}
              inputRef={inputRef}
              onFileSelect={handleFileSelect}
            />
          ) : null}

          {isAnalyzing ? <AnalyzingStep /> : null}

          {step === "review" && review ? (
            <ImporterQuoteLibraryReview
              entries={review.entries}
              onChange={(entries) =>
                setReview({ ...review, entries })
              }
              overLimitNonce={overLimitNonce}
              planContext={review.planContext}
              sourceName={review.sourceName}
              warnings={review.warnings}
            />
          ) : null}
        </ResponsiveOverlayBody>

        <ResponsiveOverlayFooter>
          {step === "upload" ? (
            <>
              <Button
                disabled={isAnalyzing}
                onClick={() => handleClose(false)}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button disabled={!file || isAnalyzing} onClick={handleAnalyze} type="button">
                {isAnalyzing ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Sparkles data-icon="inline-start" />
                )}
                {isAnalyzing ? "Analyzing..." : "Analyze"}
              </Button>
            </>
          ) : null}

          {step === "review" ? (
            <>
              <Button
                disabled={isCommitting}
                onClick={() => {
                  setStep("upload");
                  setReview(null);
                }}
                type="button"
                variant="ghost"
              >
                Back
              </Button>
              <Button
                disabled={isCommitting || !hasSelectedItems(review)}
                onClick={handleCommit}
                type="button"
              >
                {isCommitting ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                {isCommitting
                  ? "Saving..."
                  : getCommitLabel(review)}
              </Button>
            </>
          ) : null}
        </ResponsiveOverlayFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

function hasSelectedItems(review: ReviewState | null): boolean {
  if (!review) return false;

  return review.entries.length > 0;
}

function getSelectedCount(review: ReviewState): number {
  return review.entries.length;
}

function isOverLimit(review: ReviewState, selectedCount: number): boolean {
  const { limit, existingCount } = review.planContext;

  if (limit === null) return false;

  return existingCount + selectedCount > limit;
}

function buildOverLimitMessage(
  review: ReviewState,
  selectedCount: number,
): string {
  const { limit, existingCount } = review.planContext;

  if (limit === null) return "";

  const overBy = existingCount + selectedCount - limit;

  return `You have ${existingCount} saved quote library entries and selected ${selectedCount} more, which is ${overBy} over your plan limit of ${limit}. Remove ${overBy} highlighted ${overBy === 1 ? "item" : "items"} from the bottom of the list, or upgrade your plan.`;
}

function getCommitLabel(review: ReviewState | null): string {
  if (!review) return "Import";

  const count = review.entries.length;

  return count === 1 ? "Import 1 entry" : `Import ${count} entries`;
}

function UploadStep({
  file,
  inputId,
  inputRef,
  onFileSelect,
}: {
  file: File | null;
  inputId: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (file: File | null) => void;
}) {
  const [isDragActive, setIsDragActive] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <label
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/80 bg-muted/20 px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-accent/20",
          isDragActive && "border-primary/70 bg-accent/30",
        )}
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          const dropped = event.dataTransfer.files?.[0];

          if (dropped) onFileSelect(dropped);
        }}
      >
        <input
          accept={importerAcceptAttribute}
          className="sr-only"
          id={inputId}
          onChange={(event) => {
            onFileSelect(event.target.files?.[0] ?? null);
          }}
          ref={inputRef}
          type="file"
        />
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
          <FileUp className="size-6" />
        </div>
        {file ? (
          <>
            <p className="text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB
            </p>
            <Button
              className="mt-2"
              onClick={(event) => {
                event.preventDefault();
                onFileSelect(null);

                if (inputRef.current) {
                  inputRef.current.value = "";
                }
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <X data-icon="inline-start" />
              Choose a different file
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, CSV, TXT, or Markdown up to{" "}
              {Math.round(importerMaxFileBytes / (1024 * 1024))} MB
            </p>
          </>
        )}
      </label>

      <Alert>
        <Sparkles className="size-4" />
        <AlertTitle>Your file stays private</AlertTitle>
        <AlertDescription>
          The file is analyzed in memory and not stored. You review everything before anything is
          saved to your business.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function AnalyzingStep() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Spinner className="size-8" />
      <p className="text-sm font-medium text-foreground">Analyzing your file...</p>
      <p className="text-xs text-muted-foreground">
        This usually takes 5-20 seconds depending on file size.
      </p>
    </div>
  );
}
