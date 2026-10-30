import {
  StatusBadge,
  type StatusTone,
} from "@/components/shared/status-badge";
import type { QuoteDiscussionState } from "@/features/quote-discussions/types";

const stateMeta: Record<
  QuoteDiscussionState,
  { label: string; tone: StatusTone }
> = {
  needs_reply: { label: "Needs reply", tone: "warning" },
  waiting_for_customer: { label: "Waiting for customer", tone: "info" },
  archived: { label: "Archived", tone: "neutral" },
};

export function QuoteDiscussionStateBadge({
  state,
  size = "sm",
}: {
  state: QuoteDiscussionState;
  size?: "default" | "sm";
}) {
  const meta = stateMeta[state];

  return <StatusBadge label={meta.label} size={size} tone={meta.tone} />;
}
