"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * App-wide Motion policy. `reducedMotion="user"` disables transform and
 * layout animations for users who request reduced motion; CSS keyframes are
 * covered separately by the global `prefers-reduced-motion` rule in
 * `app/globals.css`. Per-component `matchMedia` checks remain where they
 * guard non-Motion work (intervals, View Transitions, dnd-kit).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
