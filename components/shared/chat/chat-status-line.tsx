import { AgentThinking } from "@/components/shared/agent-thinking";

/**
 * The single in-progress line shown while a turn runs — "Thinking", or the
 * label of the tool currently executing. BoardUI Agent Thinking dot-wave
 * indicator with a shimmering label and elapsed timer; under
 * `prefers-reduced-motion` it falls back to a static indicator and text.
 */
export function ChatStatusLine({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return <AgentThinking variant="wave" label={label} className={className} />;
}
