"use client";

import { useState, useTransition } from "react";
import { BellRing, Square } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type AutoFollowUpStatusProps = {
  enabled: boolean;
  attempts: number;
  maxAttempts: number;
  delayDays: number;
  lastSentAt: Date | null;
  stoppedAt: Date | null;
  /** Business-wide active auto follow-up sequences and the plan cap. */
  activeCount?: number;
  activeLimit?: number | null;
  stopAction: () => Promise<{ error?: string; success?: string }>;
};

export function AutoFollowUpStatus({
  enabled,
  attempts,
  maxAttempts,
  delayDays,
  lastSentAt,
  stoppedAt,
  activeCount,
  activeLimit,
  stopAction,
}: AutoFollowUpStatusProps) {
  const [isPending, startTransition] = useTransition();
  const [stopped, setStopped] = useState(!!stoppedAt);

  if (!enabled) {
    return null;
  }

  const isActive = !stopped && attempts < maxAttempts;
  const isComplete = !stopped && attempts >= maxAttempts;

  function handleStop() {
    startTransition(async () => {
      const result = await stopAction();

      if (result.error) {
        toast.error(result.error);
      } else {
        setStopped(true);
        toast.success("Auto follow-up stopped.");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <BellRing className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Auto follow-up
            {isActive ? (
              <Badge className="ml-2" variant="secondary">
                Active
              </Badge>
            ) : stopped ? (
              <Badge className="ml-2" variant="outline">
                Stopped
              </Badge>
            ) : isComplete ? (
              <Badge className="ml-2" variant="outline">
                Complete
              </Badge>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stopped
              ? `Stopped after ${attempts} of ${maxAttempts} follow-up${attempts !== 1 ? "s" : ""}.`
              : isComplete
                ? `All ${maxAttempts} follow-up${maxAttempts !== 1 ? "s" : ""} sent.`
                : `${attempts} of ${maxAttempts} sent · every ${delayDays} day${delayDays !== 1 ? "s" : ""}`}
          </p>
          {typeof activeLimit === "number" && activeLimit > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activeCount ?? 0} of {activeLimit} active auto follow-up
              {activeLimit !== 1 ? "s" : ""} used on your plan.
            </p>
          ) : null}
        </div>
      </div>

      {isActive ? (
        <Button
          disabled={isPending}
          onClick={handleStop}
          size="xs"
          type="button"
          variant="outline"
        >
          {isPending ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : (
            <Square data-icon="inline-start" className="size-3" />
          )}
          Stop
        </Button>
      ) : null}
    </div>
  );
}
