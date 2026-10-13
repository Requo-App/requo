"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";

export function FollowUpMessageCopyButton({
  message,
  label = "Copy message",
  size = "sm",
}: {
  message: string;
  label?: string;
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("Follow-up message copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy the message. Try selecting and copying manually.");
    }
  }

  return (
    <Button onClick={handleCopy} size={size} type="button" variant="outline">
      {copied ? (
        <Check data-icon="inline-start" />
      ) : (
        <Copy data-icon="inline-start" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}
