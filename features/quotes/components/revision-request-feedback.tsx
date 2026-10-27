import type { QuoteRevisionRequest } from "@/features/quotes/types";

type RevisionRequestFeedbackProps = {
  requests: QuoteRevisionRequest[];
};

export function RevisionRequestFeedback({
  requests,
}: RevisionRequestFeedbackProps) {
  if (!requests.length) {
    return null;
  }

  // Show only the most recent request (pending takes priority)
  const latestRequest =
    requests.find((r) => r.status === "pending") ?? requests[0];

  if (!latestRequest.message) {
    return (
      <p className="text-sm text-muted-foreground">
        The customer requested a revision but did not leave specific feedback.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-warning-ink">
        Customer message
      </p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {latestRequest.message}
      </p>
    </div>
  );
}
