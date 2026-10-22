"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { ArrowUp, Square } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

type ChatComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Receives the trimmed text. The caller decides whether to clear `value`. */
  onSubmit: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  /** Blocks the whole composer (no session yet, message limit reached). */
  disabled?: boolean;
  /** A turn is in flight: send becomes stop, but typing ahead stays allowed. */
  busy?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
  maxLength?: number;
  /** Small print rendered under the pill. */
  hint?: ReactNode;
  /** Extra controls on the action row, left of the send button. */
  actions?: ReactNode;
  className?: string;
};

/**
 * The shared chat composer: a single rounded box with the textarea on top and
 * an action row beneath it, used by the assistant, the dashboard home
 * box, and the public customer chat.
 *
 * Enter sends, Shift+Enter adds a line, and the textarea grows with its
 * content (`field-sizing: content`) up to a capped height.
 */
export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  ariaLabel,
  placeholder,
  disabled = false,
  busy = false,
  onStop,
  autoFocus = false,
  maxLength,
  hint,
  actions,
  className,
}: ChatComposerProps) {
  const submit = () => {
    const text = value.trim();
    if (!text || busy || disabled) return;
    onSubmit(text);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <InputGroup
        className="chat-composer-surface overflow-hidden rounded-xl border border-border/60 shadow-none transition-[border-color,box-shadow] has-disabled:opacity-100 has-[[data-slot=input-group-control]:focus-visible]:ring-0"
      >
        <InputGroupTextarea
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          className="ai-chat-scrollbar max-h-[12.5rem] min-h-11 border-0 px-4 pt-3.5 shadow-none ring-0 focus-visible:border-0 focus-visible:bg-transparent focus-visible:ring-0"
          disabled={disabled}
          maxLength={maxLength}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          value={value}
        />
        <InputGroupAddon align="block-end" className="cursor-default gap-1.5 px-3 pb-3">
          {actions}
          {busy ? (
            <InputGroupButton
              aria-label="Stop generating"
              className="ml-auto rounded-lg"
              onClick={onStop}
              size="icon-sm"
              variant="secondary"
            >
              <Square className="fill-current" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              aria-label="Send message"
              className="ml-auto rounded-lg disabled:opacity-70"
              disabled={disabled || value.trim().length === 0}
              size="icon-sm"
              type="submit"
              variant="default"
            >
              <ArrowUp />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
      {hint}
    </form>
  );
}
