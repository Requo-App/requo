"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { FollowUpMessageCopyButton } from "@/features/follow-ups/components/follow-up-message-copy-button";

type FollowUpAiMessageButtonProps = {
  /** The server loads the customer, business and quote link from this. */
  followUpId: string;
  aiTone?: "balanced" | "warm" | "direct" | "formal";
};

export function FollowUpAiMessageButton({
  followUpId,
  aiTone = "balanced",
}: FollowUpAiMessageButtonProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateMessage() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/business/follow-ups/suggest-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followUpId,
          aiTone,
        }),
      });

      if (!response.ok) {
        setError("Could not generate a message right now.");
        return;
      }

      const data = await response.json();
      setMessage(data.message);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (message) {
    return (
      <div data-padding="none" className="soft-panel flex flex-col gap-2.5 px-4 py-3.5 shadow-none">
        <p className="meta-label">AI-generated message</p>
        <p className="text-sm leading-6 text-foreground">{message}</p>
        <div className="flex flex-wrap items-center gap-2">
          <FollowUpMessageCopyButton message={message} />
          <Button
            disabled={loading}
            onClick={generateMessage}
            size="sm"
            type="button"
            variant="ghost"
          >
            {loading ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            Regenerate
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        disabled={loading}
        onClick={generateMessage}
        size="sm"
        type="button"
        variant="outline"
      >
        {loading ? (
          <Spinner data-icon="inline-start" aria-hidden="true" />
        ) : (
          <Sparkles data-icon="inline-start" />
        )}
        {loading ? "Generating..." : "Generate AI message"}
      </Button>
      {error ? <p className="text-xs text-destructive-ink">{error}</p> : null}
    </div>
  );
}
