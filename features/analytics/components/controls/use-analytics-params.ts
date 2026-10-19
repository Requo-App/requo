"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * URL-state writer for the analytics toolbar and tab nav.
 *
 * Range, custom dates, comparison, and tab live in the query string so the
 * view is shareable and back/forward-safe; every control goes through this
 * one hook so a change replaces the current history entry quietly and swaps
 * the data regions via fresh Suspense boundaries.
 */
export function useAnalyticsParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      const query = params.toString();
      startTransition(() => {
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return { update, isPending };
}
