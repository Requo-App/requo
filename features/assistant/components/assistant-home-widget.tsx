"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ChatComposer } from "@/components/shared/chat/chat-composer";
import { DashboardGreeting } from "@/features/businesses/components/dashboard-greeting";
import { getBusinessAssistantPath } from "@/features/businesses/routes";
import type { BusinessOverviewCounts } from "@/features/businesses/types";
import type { FollowUpOverviewData } from "@/features/follow-ups/types";

/**
 * The dashboard's front door to the Assistant.
 *
 * A centred greeting with stats above a bare composer — no card, no
 * recommendations. It owns no conversation: the prompt is handed to the
 * Assistant surface, which mints the session on its first send. The box
 * clears as it hands over, so returning to the dashboard shows an empty
 * prompt rather than the message that was already sent.
 */
export function AssistantHomeWidget({
  businessSlug,
  userName,
  counts,
  followUpCounts,
}: {
  businessSlug: string;
  userName: string;
  counts: BusinessOverviewCounts;
  followUpCounts: FollowUpOverviewData["counts"];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSend = (text: string) => {
    setInput("");
    const path = `${getBusinessAssistantPath(businessSlug)}?q=${encodeURIComponent(text)}`;
    startTransition(() => {
      router.push(path);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 py-6 text-center">
      <DashboardGreeting
        counts={counts}
        followUpCounts={followUpCounts}
        userName={userName}
      />
      <ChatComposer
        ariaLabel="Ask the assistant"
        className="text-left"
        disabled={pending}
        maxLength={2000}
        onSubmit={handleSend}
        onValueChange={setInput}
        placeholder="Ask anything about your business"
        value={input}
      />
    </div>
  );
}
