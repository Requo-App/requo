"use client";

import { useSyncExternalStore, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const emptySubscribe = () => () => {};

/**
 * False during SSR and the first paint, true once hydrated. The freshness
 * caption formats in the viewer's timezone, which the server cannot know —
 * rendering `null` on the server keeps hydration mismatch-free without an
 * effect that would cascade a state update.
 */
function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * "Updated HH:mm" caption plus a ghost refresh button. The timestamp formats
 * on the client (server timezones would make hydration mismatch), and refresh
 * revalidates in place without losing the current scroll or range.
 */
export function AnalyticsFreshness({ updatedAt }: { updatedAt: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const hydrated = useHydrated();

  const label = hydrated
    ? new Date(updatedAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{label ? `Updated ${label}` : "Updated just now"}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Refresh analytics"
        className="text-muted-foreground"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {isPending ? (
          <Spinner className="size-3.5" />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden />
        )}
      </Button>
    </div>
  );
}
