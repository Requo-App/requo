"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, HTMLAttributes } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

type InViewRevealProps = HTMLAttributes<HTMLDivElement> & {
  delay?: number;
  once?: boolean;
  rootMargin?: string;
  threshold?: number | number[];
};

/**
 * One-time entrance for marketing content.
 *
 * The server render is fully visible. Once mounted, a motion-allowed visitor's
 * below-fold content is held at the start of the fade-up until it first enters
 * the viewport; anything already on screen stays put, so the first paint never
 * flashes an above-fold hero or heading. The CSS handshake lives in
 * `app/globals.css`; the observer disconnects after the first entrance unless
 * `once` is false.
 */
export function InViewReveal({
  children,
  className,
  delay = 0,
  once = true,
  rootMargin = "0px 0px -8% 0px",
  style,
  threshold = 0.12,
  ...props
}: InViewRevealProps) {
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

    if (rect.top < window.innerHeight && rect.bottom > 0) {
      root.dataset.motion = "idle";
      return;
    }

    root.dataset.motion = "waiting";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            root.dataset.motion = "visible";
            if (once) {
              observer.disconnect();
            }
          } else if (!once) {
            root.dataset.motion = "waiting";
          }
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(root);

    return () => observer.disconnect();
  }, [once, prefersReducedMotion, rootMargin, threshold]);

  return (
    <div
      {...props}
      className={cn("marketing-reveal", className)}
      data-motion="idle"
      ref={rootRef}
      style={
        {
          ...style,
          "--marketing-reveal-delay": `${delay}ms`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
