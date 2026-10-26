"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const REVEAL_THRESHOLD = 0.2;

/**
 * One-time entrance for a business row.
 *
 * The row starts fully rendered, so it stays readable without JavaScript and
 * in the static HTML. Once mounted, motion-allowed visitors see the text and
 * mock held just below their final position until the row first enters the
 * viewport; the CSS then fades the text up and follows with the mock. The
 * observer disconnects after the first entrance, so scrolling back never
 * replays it.
 *
 * The motion state lives on the DOM node rather than in React state: this is
 * a one-way CSS handshake, not data the tree needs to re-render for.
 */
export function MarketingFeatureReveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    if (
      prefersReducedMotion ||
      typeof IntersectionObserver === "undefined"
    ) {
      root.dataset.motion = "idle";
      return;
    }

    const rect = root.getBoundingClientRect();

    // A row that is already on screen has painted in its final position.
    // Hiding it now would flash the content out and back in, so leave it idle.
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      root.dataset.motion = "idle";
      return;
    }

    root.dataset.motion = "waiting";

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        root.dataset.motion = "visible";
        observer.disconnect();
      },
      { threshold: REVEAL_THRESHOLD },
    );

    observer.observe(root);

    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return (
    <div
      className={cn("marketing-feature-reveal", className)}
      data-motion="idle"
      ref={rootRef}
    >
      {children}
    </div>
  );
}
