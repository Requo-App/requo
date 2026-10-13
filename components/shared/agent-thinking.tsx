"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Agent Thinking — the agent "thinking" state that sits above a chat composer
 * while a response is being worked on.
 *
 * Four curated variants:
 * - `wave`     dot grid with a diagonal wavefront gliding top-left → bottom-right
 * - `spin`     dot grid with a bright head orbiting the grid clockwise
 * - `stars`    sparkles twinkling in and out with a stagger
 * - `infinity` a comet trail sweeping a figure-eight
 *
 * Every variant pairs the indicator with a shimmering label and an elapsed
 * timer that starts when the loader mounts. Shimmer and CSS animations fall
 * back to static rendering under `prefers-reduced-motion` (see globals.css).
 */

export type AgentThinkingVariant = "wave" | "spin" | "stars" | "infinity";
export type AgentThinkingTone = "subtle" | "default" | "primary" | "accent";

export interface AgentThinkingProps {
  variant?: AgentThinkingVariant;
  /** Status label, e.g. "Thinking" or "Searching the docs". */
  label?: string;
  /** Tone of the indicator + label. Defaults per variant (`stars` is subtle). */
  tone?: AgentThinkingTone;
  /** Animated highlight traveling across the label. */
  shimmer?: boolean;
  /** Elapsed seconds since mount, rendered after the label. */
  showTimer?: boolean;
  className?: string;
}

const agentThinkingVariants = cva("flex items-center gap-2.5", {
  variants: {},
});

const agentThinkingLabelVariants = cva("text-body-medium", {
  variants: {
    shimmer: {
      true: "bui-agent-thinking-label",
      false: "",
    },
  },
  defaultVariants: {
    shimmer: true,
  },
});

const TONE_COLORS: Record<AgentThinkingTone, string> = {
  subtle: "var(--color-text-tertiary)",
  default: "var(--color-text-secondary)",
  primary: "var(--color-text-primary)",
  accent: "var(--color-blue-500)",
};

const VARIANT_TONE: Record<AgentThinkingVariant, AgentThinkingTone> = {
  wave: "default",
  spin: "default",
  stars: "subtle",
  infinity: "default",
};

/* ------------------------------------------------------------------- dots */

const DOTS_GRID = 3;
const DOTS_SIZE = 4;
const DOTS_GAP = 2;
const DOTS_PERIOD_MS = 640;

// Static first frame: identical on server and client, and the resting state
// under prefers-reduced-motion.
const DOTS_SEED = [0.55, 0.3, 0.15, 0.85, 0.55, 0.3, 1, 0.85, 0.55];

/**
 * How far along the pattern's travel direction each cell sits, in [0, 1).
 * The wave scalar is compressed below 1 so the phase wrap reads as the front
 * leaving the grid and re-entering; the spin angle is naturally cyclic.
 */
function dotScalar(variant: "wave" | "spin", col: number, row: number) {
  const m = DOTS_GRID - 1;
  if (variant === "wave") {
    return ((col + row) / (2 * m)) * (DOTS_GRID / (DOTS_GRID + 1));
  }
  const center = m / 2;
  return (Math.atan2(row - center, col - center) / (2 * Math.PI) + 1) % 1;
}

function DotsIndicator({ variant }: { variant: "wave" | "spin" }) {
  // Static seed on server + first paint (and the resting state under
  // prefers-reduced-motion). CSS takes over the travel after mount — one
  // state flip, not a 12fps interval re-render.
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Deferred past paint so the static seed commits first (no mismatch,
    // no cascading render): CSS takes over the travel from here.
    const id = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <span
      aria-hidden
      className="grid shrink-0"
      style={{
        gridTemplateColumns: `repeat(${DOTS_GRID}, ${DOTS_SIZE}px)`,
        gap: DOTS_GAP,
      }}
    >
      {DOTS_SEED.map((opacity, i) => {
        const scalar = dotScalar(
          variant,
          i % DOTS_GRID,
          Math.floor(i / DOTS_GRID),
        );
        return (
          <span
            key={i}
            className={animated ? "bui-agent-thinking-dot rounded-[1px] bg-current" : "rounded-[1px] bg-current"}
            style={{
              width: DOTS_SIZE,
              height: DOTS_SIZE,
              opacity,
              ...(animated
                ? {
                    animationDuration: `${DOTS_PERIOD_MS}ms`,
                    animationDelay: `${-Math.round(scalar * DOTS_PERIOD_MS)}ms`,
                  }
                : null),
            }}
          />
        );
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ stars */

const STAR_PERIOD_S = 1.4;
const STAR_SIZE = 14;
const STAR_COUNT = 5;
const STAR_LAYOUT = [
  { x: 50, y: 46, scale: 1 },
  { x: 18, y: 22, scale: 0.55 },
  { x: 82, y: 26, scale: 0.45 },
  { x: 78, y: 76, scale: 0.55 },
  { x: 22, y: 78, scale: 0.4 },
];
const STAR_PATH = "M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z";

function StarsIndicator() {
  const box = STAR_SIZE * 1.5;
  return (
    <span
      aria-hidden
      className="bui-agent-thinking-stars relative block shrink-0"
      style={{ width: box, height: box }}
    >
      {STAR_LAYOUT.slice(0, STAR_COUNT).map((star, i) => {
        const size = STAR_SIZE * star.scale;
        return (
          <svg
            key={i}
            viewBox="0 0 24 24"
            className="bui-agent-thinking-star absolute"
            style={{
              width: size,
              height: size,
              left: `${star.x}%`,
              top: `${star.y}%`,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              animationDuration: `${STAR_PERIOD_S}s`,
              animationDelay: `${(i * STAR_PERIOD_S * 0.7) / STAR_COUNT}s`,
            }}
          >
            <path d={STAR_PATH} fill="currentColor" />
          </svg>
        );
      })}
    </span>
  );
}

/* --------------------------------------------------------------- infinity */

const INFINITY_WIDTH = 32;
const INFINITY_TRAIL = 11;
const INFINITY_STROKE = 2.75;
const INFINITY_DURATION_S = 1.2;
const INFINITY_PATH =
  "M28 14C33 5 47 5 47 14C47 23 33 23 28 14C23 5 9 5 9 14C9 23 23 23 28 14Z";

function InfinityIndicator() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 56 28"
      className="shrink-0"
      // The figure-eight spans x 9-47 of the 56-wide viewBox, so the svg box
      // carries ~4px of dead space per side at this width; pull it back in so
      // the label sits at the loader's real gap.
      style={{ width: INFINITY_WIDTH, height: INFINITY_WIDTH / 2, margin: "0 -4px" }}
    >
      <path
        d={INFINITY_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={INFINITY_STROKE}
        opacity={0.15}
      />
      <path
        d={INFINITY_PATH}
        pathLength={100}
        fill="none"
        stroke="currentColor"
        strokeWidth={INFINITY_STROKE}
        strokeLinecap="round"
        strokeDasharray={`${INFINITY_TRAIL} ${100 - INFINITY_TRAIL}`}
        className="bui-agent-thinking-comet"
        style={{ animationDuration: `${INFINITY_DURATION_S}s` }}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ timer */

function ElapsedTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = performance.now();
    const id = window.setInterval(
      () => setElapsed((performance.now() - started) / 1000),
      100,
    );
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="font-mono text-caption-1-regular text-muted-foreground tabular-nums">
      {elapsed.toFixed(1)}s
    </span>
  );
}

/* ----------------------------------------------------------------- loader */

export function AgentThinking({
  variant = "wave",
  label = "Thinking",
  tone,
  shimmer = true,
  showTimer = true,
  className,
}: AgentThinkingProps) {
  const color = TONE_COLORS[tone ?? VARIANT_TONE[variant]];

  return (
    <div
      role="status"
      className={cn(agentThinkingVariants(), className)}
      style={{ color, "--bui-agent-thinking-tone": color } as CSSProperties}
    >
      {(variant === "wave" || variant === "spin") && <DotsIndicator variant={variant} />}
      {variant === "stars" && <StarsIndicator />}
      {variant === "infinity" && <InfinityIndicator />}
      <span
        aria-label={label}
        className={agentThinkingLabelVariants({ shimmer })}
      >
        {label}
      </span>
      {showTimer && <ElapsedTimer />}
    </div>
  );
}
