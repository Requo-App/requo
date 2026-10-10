import type { ReactNode } from "react";
import { RiErrorWarningFill } from "@remixicon/react";

import type {
  NotificationAction,
  NotificationIcon,
  NotificationStatus,
} from "./notification";

/**
 * Imperative toast API backed by the `Notification` card.
 *
 * Drop-in replacement for the previous sonner-based `toast`: same call
 * shape (`toast.success(message, { description, id, duration })`) so call
 * sites only change their import path. Rendering happens in
 * `NotificationToaster` (mounted once in the root layout); state lives in
 * this module-level store so `toast` works from any client context —
 * components, hooks, and event handlers alike.
 *
 * Status mapping: `Notification` ships neutral/information/success/
 * error. `message` renders neutral; `warning` renders a neutral well with a
 * caution icon, since Requo has no global amber status token.
 */

export type ToastOptions = {
  /** Supporting line under the title (sonner: `description`). */
  description?: ReactNode;
  /** Stable key: repeat calls with the same id replace the toast in place. */
  id?: string | number;
  /** Auto-dismiss delay in ms. Defaults to 4000 (errors: 6000). */
  duration?: number;
  /** Small action buttons rendered below the message. */
  actions?: NotificationAction[];
  /** Show the dismiss control. Defaults to true. */
  dismissible?: boolean;
};

export type ToastItem = {
  key: string;
  title: ReactNode;
  description?: ReactNode;
  status: NotificationStatus;
  icon?: NotificationIcon;
  actions?: NotificationAction[];
  duration: number;
  dismissible: boolean;
};

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;
const MAX_TOASTS = 5;

let counter = 0;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeToToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastsSnapshot() {
  return items;
}

function upsert(item: ToastItem) {
  const index = items.findIndex((existing) => existing.key === item.key);
  items =
    index >= 0
      ? items.map((existing) => (existing.key === item.key ? item : existing))
      : [...items.slice(-MAX_TOASTS + 1), item];
  emit();
  return item.key;
}

export function removeToast(key: string) {
  if (!items.some((item) => item.key === key)) return;
  items = items.filter((item) => item.key !== key);
  emit();
}

function push(
  status: NotificationStatus,
  title: ReactNode,
  options?: ToastOptions,
  icon?: NotificationIcon,
) {
  const key =
    options?.id !== undefined ? String(options.id) : `toast-${(counter += 1)}`;
  return upsert({
    key,
    title,
    description: options?.description,
    status,
    icon,
    actions: options?.actions,
    duration:
      options?.duration ?? (status === "error" ? ERROR_DURATION : DEFAULT_DURATION),
    dismissible: options?.dismissible ?? true,
  });
}

function createToast(status: NotificationStatus, icon?: NotificationIcon) {
  return (title: ReactNode, options?: ToastOptions) =>
    push(status, title, options, icon);
}

export const toast = {
  success: createToast("success"),
  error: createToast("error"),
  info: createToast("information"),
  message: createToast("neutral"),
  /** Cautionary tone: neutral well with a warning glyph (no amber token). */
  warning: createToast("neutral", RiErrorWarningFill),
  dismiss: (id?: string | number) => {
    if (id === undefined) {
      items = [];
      emit();
      return;
    }
    removeToast(String(id));
  },
};
