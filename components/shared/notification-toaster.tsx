"use client";

import { useSyncExternalStore } from "react";

import {
  Notification,
  NotificationViewport,
  type NotificationPosition,
} from "./notification";
import {
  getToastsSnapshot,
  removeToast,
  subscribeToToasts,
} from "./notify";

/**
 * App-wide toaster: renders queued `toast()` calls as `Notification`
 * cards in a `NotificationViewport` stack. Mount once (root layout); the docs
 * usage example is a single `Notification`, this is that card driven by the
 * `notify` store with auto-dismiss + exit animation per item.
 */
export function NotificationToaster({
  position = "bottom-right",
}: {
  position?: NotificationPosition;
} = {}) {
  const toasts = useSyncExternalStore(
    subscribeToToasts,
    getToastsSnapshot,
    getToastsSnapshot,
  );

  return (
    <NotificationViewport position={position}>
      {toasts.map((item) => (
        <Notification
          key={item.key}
          title={item.title}
          description={item.description}
          status={item.status}
          icon={item.icon}
          actions={item.actions}
          dismissible={item.dismissible}
          autoDismissDuration={item.duration}
          onDismiss={() => removeToast(item.key)}
        />
      ))}
    </NotificationViewport>
  );
}
