"use client";

import { motion } from "motion/react";

type AnimatedSuccessIconProps = {
  className?: string;
  size?: number;
  delay?: number;
};

/**
 * Animated checkmark inside a circle — plays on mount.
 * Uses CSS token colors (primary, accent) to stay in-system.
 */
export function AnimatedSuccessIcon({
  className,
  size = 56,
  delay = 0.15,
}: AnimatedSuccessIconProps) {
  return (
    <motion.div
      className={className}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
        delay,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Outer ring */}
        <motion.circle
          cx="28"
          cy="28"
          r="26"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeOpacity="0.15"
          fill="var(--color-accent)"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.36, delay, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* Checkmark */}
        <motion.path
          d="M18 28.5L24.5 35L38 21.5"
          stroke="var(--color-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{
            duration: 0.36,
            delay: delay + 0.15,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      </svg>
    </motion.div>
  );
}
