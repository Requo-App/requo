"use client";

import { motion } from "motion/react";
import { CheckCircle2, XCircle, Edit, CircleSlash, Clock, Send, FileText } from "lucide-react";

/**
 * Every public quote status. The union matches `QuoteStatus`, so a caller
 * never has to assert away a status to satisfy the icon.
 */
type ResponseType =
  | "accepted"
  | "rejected"
  | "revision_requested"
  | "voided"
  | "expired"
  | "sent"
  | "draft";

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
  sent: Send,
  draft: FileText,
} as const;

const colorMap = {
  accepted: "text-success",
  rejected: "text-destructive",
  revision_requested: "text-warning",
  voided: "text-muted-foreground",
  expired: "text-warning",
  sent: "text-muted-foreground",
  draft: "text-muted-foreground",
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
