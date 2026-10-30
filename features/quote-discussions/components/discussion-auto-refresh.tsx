"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const discussionRefreshIntervalMs = 30_000;

/**
 * Postgres through Drizzle is the source of truth. Business notifications use
 * Supabase Realtime, but discussion threads are not published to a broadly
 * accessible channel, so open conversations refresh on a short interval
 * instead. Writes still go through authorized server actions only.
 */
export function DiscussionAutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      router.refresh();
    }, discussionRefreshIntervalMs);

    return () => window.clearInterval(interval);
  }, [router]);

  return null;
}
