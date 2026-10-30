"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markQuoteDiscussionReadAction } from "@/features/quote-discussions/actions";

export function DiscussionReadMarker({
  businessSlug,
  discussionId,
  lastMessageAt,
}: {
  businessSlug: string;
  discussionId: string;
  lastMessageAt: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const key = `quote-discussion-read:${discussionId}:${lastMessageAt}`;
    let marked = false;

    const markRead = () => {
      // A hidden tab has not shown the messages it would be marking read.
      if (marked || document.visibilityState !== "visible") {
        return;
      }

      try {
        if (window.sessionStorage.getItem(key)) {
          marked = true;
          return;
        }
      } catch {
        // Storage can be unavailable (privacy settings); marking read still
        // runs, it just may repeat on the next mount.
      }

      marked = true;

      try {
        window.sessionStorage.setItem(key, "1");
      } catch {
        // See above.
      }

      // The watermark is the timestamp this view rendered, not "now": a
      // message committed after the render must stay unread.
      void markQuoteDiscussionReadAction(
        businessSlug,
        discussionId,
        lastMessageAt,
      ).then((result) => {
        if (result.ok) {
          router.refresh();
        }
      });
    };

    markRead();
    document.addEventListener("visibilitychange", markRead);

    return () => document.removeEventListener("visibilitychange", markRead);
  }, [businessSlug, discussionId, lastMessageAt, router]);

  return null;
}
