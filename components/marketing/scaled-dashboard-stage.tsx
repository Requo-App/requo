"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// Canonical desktop reference: the width the /home dashboard is designed and
// captured at. The crop ends at the bottom border of the queue's first row.
const STAGE_WIDTH = 1440;
const STAGE_HEIGHT = 725;

// Below this stage width the full composition would shrink to unreadable type.
// Show the main content column instead, starting after the 232px sidebar. The
// 864px crop ends in the gutter after the third stat card, so the window never
// shows a sliced card at narrow widths. Keep these values in sync with the
// `.dashboard-stage-aspect` container query in app/globals.css.
const CROP_BELOW_WIDTH = 864;
const CROP_WIDTH = 864;
const CROP_LEFT = 232;

type StageLayout = {
  height: number;
  offset: number;
  scale: number;
};

export function ScaledDashboardStage({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<StageLayout | null>(null);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const update = () => {
      const width = element.clientWidth;

      if (width <= 0) {
        return;
      }

      const cropped = width < CROP_BELOW_WIDTH;
      const visibleWidth = cropped ? CROP_WIDTH : STAGE_WIDTH;
      const scale = Math.min(1, width / visibleWidth);
      const offset = cropped
        ? Math.min(CROP_LEFT, STAGE_WIDTH - visibleWidth)
        : 0;

      setLayout({
        height: Math.round(STAGE_HEIGHT * scale),
        offset: Math.round(offset * scale),
        scale,
      });
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const measured = layout !== null;

  return (
    <div className="dashboard-stage-container w-full" ref={containerRef}>
      <div
        className={cn(
          "w-full overflow-hidden",
          !measured && "dashboard-stage-aspect",
        )}
        style={measured ? { height: layout.height } : undefined}
      >
        <div
          className={cn("relative origin-top-left", !measured && "invisible")}
          style={{
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            left: measured ? -layout.offset : 0,
            transform: `scale(${layout?.scale ?? 1})`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
