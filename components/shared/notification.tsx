"use client";

import type {
  ComponentType,
  HTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import {
  Children,
  isValidElement,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiInformationFill,
  RiNotification3Fill,
} from "@remixicon/react";
import { AnimatePresence, motion } from "motion/react";
import { cva } from "class-variance-authority";
import { Avatar, type AvatarProps } from "@/components/shared/avatar";
import { Button, type ButtonProps } from "@/components/shared/button";
import { CloseButton } from "@/components/shared/close-button";
import { cn } from "@/lib/utils";

/**
 * Notification, styled with the Requo system (Requo semantic tokens) instead
 * of the BoardUI theme.
 *
 * - Panel floats on the overlay surface (`--overlay-surface-*`), which flips
 *   in dark mode via CSS vars — no `dark:` overrides.
 * - Status visuals reuse defined tokens only: neutral/info/success step
 *   through muted/primary tints, errors use destructive. Requo has no global
 *   amber/sky status tokens, so cautionary tones keep a neutral well with a
 *   distinct icon (see the `icon` prop).
 */

export type NotificationStatus = "neutral" | "information" | "success" | "error";

export type NotificationPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type NotificationIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type NotificationAvatar = Omit<AvatarProps, "size"> & {
  presence?: "online" | "busy" | "offline";
};

export type NotificationAction = {
  label: ReactNode;
  onClick?: () => void;
  variant?: ButtonProps["variant"];
};

export interface NotificationProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    | "title"
    | "onDrag"
    | "onDragStart"
    | "onDragEnd"
    | "onAnimationStart"
    | "onAnimationEnd"
  > {
  title: ReactNode;
  description?: ReactNode;
  timestamp?: ReactNode;
  status?: NotificationStatus;
  /** Custom leading icon. Defaults to the icon associated with `status`. */
  icon?: NotificationIcon;
  /** Avatar leading visual. When set, it takes precedence over `icon`. */
  avatar?: NotificationAvatar;
  /** Optional small action buttons rendered below the message. */
  actions?: NotificationAction[];
  dismissible?: boolean;
  closeLabel?: string;
  /** Called after the dismiss animation completes. */
  onDismiss?: () => void;
  /**
   * Automatically dismiss after this many milliseconds. A 3px countdown bar
   * is rendered along the full bottom edge for the same duration.
   */
  autoDismissDuration?: number;
  /** Optional entrance delay in seconds. */
  introDelay?: number;
  ref?: Ref<HTMLDivElement>;
}

export interface NotificationViewportProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    | "children"
    | "onDrag"
    | "onDragStart"
    | "onDragEnd"
    | "onAnimationStart"
    | "onAnimationEnd"
  > {
  children?: ReactNode;
  /** Edge or corner where the notification stack is anchored. */
  position?: NotificationPosition;
  /** @deprecated Use `position` instead. */
  placement?: Extract<NotificationPosition, "bottom-left" | "bottom-right">;
}

const STATUS_ICON: Record<NotificationStatus, NotificationIcon> = {
  neutral: RiNotification3Fill,
  information: RiInformationFill,
  success: RiCheckboxCircleFill,
  error: RiErrorWarningFill,
};

const notificationCardClassName =
  "relative flex w-full items-start gap-3 overflow-hidden p-4 pr-11 rounded-2xl border border-border/80 bg-card text-card-foreground shadow-[var(--overlay-surface-shadow)]";

const notificationVisualVariants = cva(
  "relative flex size-10 shrink-0 items-center justify-center rounded-full",
  {
    variants: {
      status: {
        neutral: "bg-muted text-muted-foreground",
        information: "bg-primary/10 text-primary",
        success: "bg-primary/10 text-primary",
        error: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      status: "neutral",
    },
  },
);

const notificationPresenceVariants = cva(
  "absolute right-0 bottom-0 size-3 rounded-full border-2 border-card",
  {
    variants: {
      presence: {
        online: "bg-success",
        busy: "bg-destructive",
        offline: "bg-muted-foreground",
      },
    },
  },
);

const notificationIconClassName = "size-5";
const notificationContentClassName = "flex min-w-0 flex-1 flex-col gap-1";
const notificationHeaderClassName =
  "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5";
const notificationTitleClassName = "text-sm font-medium text-foreground";
const notificationTimestampClassName = "text-sm text-muted-foreground";
const notificationDescriptionClassName = "text-sm leading-5 text-muted-foreground";
const notificationActionsClassName = "mt-1.5 flex flex-wrap items-center gap-2";
const notificationCloseClassName = "absolute top-3 right-3";

const VIEWPORT_POSITION = {
  "top-left": "top-3 left-3 items-start sm:top-6 sm:left-6",
  "top-center": "top-3 left-1/2 -translate-x-1/2 items-center sm:top-6",
  "top-right": "top-3 right-3 items-end sm:top-6 sm:right-6",
  "bottom-left": "bottom-3 left-3 items-start sm:bottom-6 sm:left-6",
  "bottom-center":
    "bottom-3 left-1/2 -translate-x-1/2 items-center sm:bottom-6",
  "bottom-right": "right-3 bottom-3 items-end sm:right-6 sm:bottom-6",
} satisfies Record<NotificationPosition, string>;

const subscribeToHydration = () => () => {};

function NotificationAvatarVisual({
  presence,
  className,
  ...avatar
}: NotificationAvatar) {
  return (
    <span className="relative shrink-0">
      <Avatar
        {...avatar}
        size="lg"
        className={cn("size-10", className)}
      />
      {presence ? (
        <span
          aria-hidden
          className={cn(notificationPresenceVariants({ presence }))}
        />
      ) : null}
    </span>
  );
}

export function Notification({
  title,
  description,
  timestamp,
  status = "neutral",
  icon,
  avatar,
  actions,
  dismissible = true,
  closeLabel = "Dismiss notification",
  onDismiss,
  autoDismissDuration,
  introDelay,
  className,
  ref,
  role,
  ...props
}: NotificationProps) {
  const [dismissed, setDismissed] = useState(false);
  const Icon = icon ?? STATUS_ICON[status];
  const hasIntro = introDelay !== undefined;
  const introDelayMs = (introDelay ?? 0) * 1000;

  useEffect(() => {
    if (!autoDismissDuration || autoDismissDuration <= 0) return;
    const timer = window.setTimeout(
      () => setDismissed(true),
      autoDismissDuration + introDelayMs,
    );
    return () => window.clearTimeout(timer);
  }, [autoDismissDuration, introDelayMs]);

  return (
    <AnimatePresence onExitComplete={onDismiss}>
      {!dismissed ? (
        <motion.div
          ref={ref}
          role={role ?? (status === "error" ? "alert" : "status")}
          initial={
            hasIntro
              ? { opacity: 0, y: 12, scale: 0.97, filter: "blur(4px)" }
              : false
          }
          animate={
            hasIntro
              ? {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  filter: "blur(0px)",
                  transition: {
                    duration: 0.25,
                    delay: introDelay,
                    ease: "easeOut",
                  },
                }
              : undefined
          }
          exit={{
            opacity: 0,
            y: 8,
            scale: 0.96,
            filter: "blur(3px)",
            transition: { duration: 0.18, ease: "easeOut" },
          }}
          className={cn(notificationCardClassName, className)}
          {...props}
        >
          {avatar ? (
            <NotificationAvatarVisual {...avatar} />
          ) : (
            <span className={cn(notificationVisualVariants({ status }))}>
              <Icon className={notificationIconClassName} aria-hidden />
            </span>
          )}

          <div className={notificationContentClassName}>
            <div className={notificationHeaderClassName}>
              <p className={notificationTitleClassName}>{title}</p>
              {timestamp ? <span className={notificationTimestampClassName}>{timestamp}</span> : null}
            </div>
            {description ? <p className={notificationDescriptionClassName}>{description}</p> : null}

            {actions?.length ? (
              <div className={notificationActionsClassName}>
                {actions.map((action, index) => (
                  <Button
                    key={index}
                    size="small"
                    variant={action.variant ?? (index === 0 ? "secondary" : "primary")}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>

          {dismissible ? (
            <CloseButton
              size="xs"
              aria-label={closeLabel}
              onClick={() => setDismissed(true)}
              className={notificationCloseClassName}
            />
          ) : null}

          {autoDismissDuration && autoDismissDuration > 0 ? (
            <motion.span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-primary"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{
                duration: autoDismissDuration / 1000,
                delay: introDelay,
                ease: "linear",
              }}
            />
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Viewport-level notification region. Anchor the stack to any corner or
 * horizontal center with `position`; children with stable keys move smoothly
 * as notifications enter and leave.
 */
export function NotificationViewport({
  children,
  position,
  placement,
  className,
  "aria-label": ariaLabel = "Notifications",
  ...props
}: NotificationViewportProps) {
  const resolvedPosition = position ?? placement ?? "bottom-right";
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      layoutRoot
      aria-label={ariaLabel}
      className={cn(
        "pointer-events-none fixed z-100 flex w-[min(400px,calc(100vw-24px))] flex-col gap-3",
        VIEWPORT_POSITION[resolvedPosition],
        className,
      )}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {Children.toArray(children).map((child, index) => (
          <motion.div
            layout
            key={isValidElement(child) && child.key !== null ? child.key : index}
            className="pointer-events-auto w-full"
            transition={{
              layout: {
                type: "spring",
                stiffness: 520,
                damping: 42,
                mass: 0.7,
              },
            }}
          >
            {child}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
