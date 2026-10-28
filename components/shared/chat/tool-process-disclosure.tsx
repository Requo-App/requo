"use client";

import { useState } from "react";
import { Check, ChevronRight, CircleAlert, Wrench } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type ToolStep = {
  id: string;
  /** Raw tool name, shown as the technical detail. */
  toolName: string;
  /** Human label, e.g. "Searching inquiries". */
  label: string;
  /** Arguments the model passed, rendered as a compact one-liner. */
  input?: unknown;
  failed?: boolean;
};

const MAX_ARGS_LENGTH = 160;

/** Renders tool arguments as `key: value, key: value`, or null when empty. */
function formatArgs(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const parts = Object.entries(input as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
    );
  if (parts.length === 0) return null;
  const text = parts.join(", ");
  return text.length > MAX_ARGS_LENGTH
    ? `${text.slice(0, MAX_ARGS_LENGTH)}…`
    : text;
}

/**
 * Collapsed summary of the tools a turn ran, expandable into the individual
 * steps and their arguments.
 *
 * Owner surface only — tool names and arguments describe internal capabilities
 * and must not be exposed on the public customer chat.
 */
export function ToolProcessDisclosure({
  steps,
  className,
}: {
  steps: ToolStep[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (steps.length === 0) return null;

  const summary =
    steps.length === 1 ? steps[0].label : `Worked with ${steps.length} tools`;

  return (
    <Collapsible className={cn("w-full", className)} onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/15">
        <Wrench aria-hidden="true" className="size-3.5" />
        <span>{summary}</span>
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 transition-transform [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)]",
            open && "rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <ol className="mt-2 flex flex-col gap-2 border-l border-border/70 pl-3">
          {steps.map((step) => {
            const args = formatArgs(step.input);
            return (
              <li className="flex flex-col gap-0.5 text-xs" key={step.id}>
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  {step.failed ? (
                    <CircleAlert
                      aria-hidden="true"
                      className="size-3.5 text-destructive-ink"
                    />
                  ) : (
                    <Check aria-hidden="true" className="size-3.5 text-primary-ink" />
                  )}
                  {step.label}
                </span>
                <span className="pl-5 font-mono text-xs break-words text-muted-foreground">
                  {step.toolName}
                  {args ? `(${args})` : "()"}
                </span>
              </li>
            );
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
