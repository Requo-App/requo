"use client";

import { motion } from "motion/react";
import { CheckCircle2, XCircle, Edit, CircleSlash, Clock } from "lucide-react";

type ResponseType = "accepted" | "rejected" | "revision_requested" | "voided" | "expired";

type AnimatedResponseIconProps = {
  type: ResponseType;
  className?: string;
};

const iconMap = {
  accepted: CheckCircle2,
  rejected: XCircle,
  revision_requested: Edit,
  voided: CircleSlash,
  expired: Clock,
} as const;

const colorMap = {
  accepted: "text-emerald-500",
  rejected: "text-red-400",
  revision_requested: "text-amber-500",
  voided: "text-muted-foreground",
  expired: "text-amber-500",
} as const;

/**
 * Icon that scales in with a subtle spring animation when a quote response is resolved.
 */
export function AnimatedResponseIcon({ type, className }: AnimatedResponseIconProps) {
  const Icon = iconMap[type];
  const color = colorMap[type];

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 18,
        delay: 0.1,
      }}
      className={className}
    >
      <Icon className={`size-5 ${color}`} />
    </motion.div>
  );
}
