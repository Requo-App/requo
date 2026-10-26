"use client";

import { useEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * A small scroll-progress handshake for the hero product window.
 *
 * The component writes one custom property and CSS turns it into a maximum
 * 12px `translate`. Motion-allowed visitors get a barely perceptible drift;
 * reduced-motion visitors get no listener at all. It never changes layout or
 * reads/writes during React render.
 */
export function MarketingHeroParallax({
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

    if (!root || prefersReducedMotion) {
      root?.style.setProperty("--marketing-parallax-progress", "0.5");
      return;
    }

    let frame = 0;

    const update = () => {
      frame = 0;

      const rect = root.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const scrollable = viewportHeight + rect.height;

      if (scrollable <= 0) {
        return;
      }

      const progress = Math.min(
        1,
        Math.max(0, (viewportHeight - rect.top) / scrollable),
      );

      root.style.setProperty(
        "--marketing-parallax-progress",
        progress.toFixed(3),
      );
    };

    const requestUpdate = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(update);
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [prefersReducedMotion]);

  return (
    <div
      className={cn("marketing-hero-parallax", className)}
      ref={rootRef}
    >
      {children}
    </div>
  );
}
