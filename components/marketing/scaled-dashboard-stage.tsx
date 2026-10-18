"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Canonical desktop reference: the width the /home dashboard is designed and
// captured at. The crop ends at the bottom border of the queue's first row.
const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 725;

export function ScaledDashboardStage({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      setScale(Math.min(1, element.clientWidth / STAGE_WIDTH));
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const measured = scale !== null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "w-full overflow-hidden",
        !measured && "aspect-[1440/725]",
      )}
      style={
        measured ? { height: Math.round(STAGE_HEIGHT * scale) } : undefined
      }
    >
      <div
        className={cn("origin-top-left", !measured && "invisible")}
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `scale(${scale ?? 1})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
