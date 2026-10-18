"use client";

import { useState } from "react";

import { ChatComposer } from "@/components/shared/chat/chat-composer";

/**
 * The /home assistant composer inside the marketing hero preview.
 *
 * Wraps the real `ChatComposer` so the preview keeps the live composer's exact
 * markup; the hero stage is inert decoration, so the field only needs local
 * (empty) state to satisfy the controlled component.
 */
export function MarketingHomeComposer() {
  const [value, setValue] = useState("");

  return (
    <ChatComposer
      ariaLabel="Ask the assistant"
      className="text-left"
      maxLength={2000}
      onSubmit={() => {}}
      onValueChange={setValue}
      placeholder="Ask anything about your business"
      value={value}
    />
  );
}
