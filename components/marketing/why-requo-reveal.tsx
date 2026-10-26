"use client";

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

const REVEAL_THRESHOLD = 0.15;

/**
 * One-time entrance for the Why Requo items.
 *
 * The section starts fully rendered, so it stays readable without JavaScript
 * and in the static HTML. Once mounted, motion-allowed visitors see the items
 * held just below their final position until the list first enters the
 * viewport; the CSS in `app/globals.css` then runs the staggered fade-up.
 * The observer disconnects after the first entrance.
 *
 * The motion state lives on the DOM node rather than in React state: this is
 * a one-way CSS handshake, not data the tree needs to re-render for.
 */
export function WhyRequoReveal({
  children,
  className,
}: {
  children: React.ReactNode;
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

    // Anchored visits (#why-requo) and tall viewports can paint the cards
    // before this effect runs. Keep them visible instead of replaying the
    // entrance over content the visitor can already read.
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
      className={cn("marketing-why-reveal", className)}
      data-motion="idle"
      ref={rootRef}
    >
      {children}
    </div>
  );
}
