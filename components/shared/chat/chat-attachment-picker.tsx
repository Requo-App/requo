"use client";

import { useId, useRef } from "react";
import { FileText, Paperclip, X } from "lucide-react";

import { InputGroupButton } from "@/components/ui/input-group";
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_ACCEPT_EXTENSIONS,
  CHAT_ATTACHMENT_MAX_BYTES,
} from "@/components/shared/chat/attachment-text";
import { cn } from "@/lib/utils";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPickable(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  if (
    (CHAT_ATTACHMENT_ACCEPT_EXTENSIONS as readonly string[]).some((ext) =>
      lowerName.endsWith(ext),
    )
  ) {
    return true;
  }
  // Extension-less or oddly-named files fall back to the MIME check.
  return file.type.startsWith("text/") || file.type === "application/pdf";
}

/**
 * Attach button for the chat composer action row. Picks are validated
 * instantly (count, size, type) — deeper checks (content, daily plan limit)
 * happen server-side at send time.
 */
export function AttachmentPickerButton({
  disabled,
  maxFiles,
  selectedCount,
  onPick,
  onError,
}: {
  disabled?: boolean;
  maxFiles: number;
  selectedCount: number;
  onPick: (files: File[]) => void;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  return (
    <>
      <input
        accept={CHAT_ATTACHMENT_ACCEPT}
        aria-label="Attach a file"
        className="sr-only"
        disabled={disabled}
        id={inputId}
        multiple={maxFiles > 1}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          // Reset so picking the same file twice still fires.
          event.target.value = "";
          if (picked.length === 0) return;
          if (selectedCount + picked.length > maxFiles) {
            onError(
              maxFiles === 1
                ? "Attach one file per message."
                : `Attach no more than ${maxFiles} files per message.`,
            );
            return;
          }
          const oversized = picked.find(
            (file) => file.size > CHAT_ATTACHMENT_MAX_BYTES,
          );
          if (oversized) {
            onError(
              `"${oversized.name}" is too large for chat. Keep files under 2 MB.`,
            );
            return;
          }
          const rejected = picked.find((file) => !isPickable(file));
          if (rejected) {
            onError("Upload a PDF, DOCX, CSV, TXT, or Markdown file.");
            return;
          }
          onError(null);
          onPick(picked);
        }}
        ref={inputRef}
        type="file"
      />
      <InputGroupButton
        aria-label="Attach a file"
        className="rounded-lg"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        size="icon-sm"
        title="Attach a PDF, DOCX, CSV, TXT, or Markdown file"
        type="button"
        variant="ghost"
      >
        <Paperclip />
      </InputGroupButton>
    </>
  );
}

/** Selected-file chips rendered above the composer input. */
export function AttachmentChips({
  files,
  onRemove,
  className,
}: {
  files: File[];
  onRemove: (index: number) => void;
  className?: string;
}) {
  if (files.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5 px-4 pt-2.5", className)}>
      {files.map((file, index) => (
        <span
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-muted px-2 py-1 text-xs text-muted-foreground"
          key={`${file.name}-${file.size}-${index}`}
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="max-w-44 truncate font-medium text-foreground">
            {file.name}
          </span>
          <span className="shrink-0">{formatFileSize(file.size)}</span>
          <button
            aria-label={`Remove ${file.name}`}
            className="shrink-0 rounded p-0.5 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onRemove(index)}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}
    </div>
  );
}
