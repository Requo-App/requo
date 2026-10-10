"use client";

import { useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";
import type { AiQuoteMissingInfoItem } from "@/features/ai/types";

type AiMissingInfoPanelProps = {
  clarificationMessage: string | null;
  missingInfo: AiQuoteMissingInfoItem[];
};

export function AiMissingInfoPanel({
  clarificationMessage,
  missingInfo,
}: AiMissingInfoPanelProps) {
  const [copied, setCopied] = useState(false);

  async function copyClarificationMessage() {
    if (!clarificationMessage) {
      return;
    }

    try {
      await window.navigator.clipboard.writeText(clarificationMessage);
      setCopied(true);
      toast.success("Clarification message copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the message. Try selecting and copying manually.");
    }
  }

  return (
    <div
      aria-live="polite"
      className="soft-panel flex flex-col gap-4 shadow-none"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <p className="text-sm font-medium text-foreground">
              Missing details
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Confirm these before sending the final quote.
          </p>
        </div>
        {clarificationMessage ? (
          <Button
            onClick={copyClarificationMessage}
            size="sm"
            type="button"
            variant="outline"
          >
            {copied ? (
              <Check data-icon="inline-start" />
            ) : (
              <Copy data-icon="inline-start" />
            )}
            {copied ? "Copied" : "Copy message"}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {missingInfo.map((item) => (
          <div
            className="rounded-lg border border-border/70 bg-background/60 px-3 py-3"
            key={`${item.label}-${item.question}`}
          >
            <p className="text-sm font-medium text-foreground">
              {item.label}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {item.question}
            </p>
          </div>
        ))}
      </div>

      {clarificationMessage ? (
        <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-3">
          <p className="meta-label">Suggested reply</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
            {clarificationMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
