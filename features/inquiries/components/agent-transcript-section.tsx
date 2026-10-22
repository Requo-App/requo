import { MessageSquare } from "lucide-react";

import { DashboardSection } from "@/components/shared/dashboard-layout";
import { getAgentTranscriptForInquiry } from "@/features/agent/queries";

/**
 * Read-only public-chat transcript attached to the inquiry that produced it.
 *
 * This is the only path by which an Agent Session becomes visible to the
 * business: a collapsible, non-interactive block with the originating
 * conversation for context before replying.
 */
export async function AgentTranscriptSection({
  businessId,
  inquiryId,
}: {
  businessId: string;
  inquiryId: string;
}) {
  const transcript = await getAgentTranscriptForInquiry(businessId, inquiryId);

  if (!transcript || transcript.length === 0) {
    return null;
  }

  return (
    <DashboardSection
      title="Public chat transcript"
      description="The originating conversation, attached read-only for context."
    >
      <details className="rounded-lg border border-border/60 bg-muted/20">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40">
          <MessageSquare className="size-4 text-muted-foreground" aria-hidden />
          View {transcript.length} message{transcript.length === 1 ? "" : "s"}
        </summary>
        <div
          className="flex max-h-96 flex-col gap-3 overflow-y-auto border-t border-border/60 px-4 py-4"
          aria-label="Public chat transcript (read-only)"
        >
          {transcript.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-primary/10 text-foreground"
                    : "bg-card text-foreground border border-border/60"
                }`}
              >
                <p className="meta-label mb-1">
                  {message.role === "user" ? "Customer" : "Chat assistant"}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {message.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </details>
    </DashboardSection>
  );
}
