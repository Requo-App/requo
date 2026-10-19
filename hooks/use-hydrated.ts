"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * Whether the client has finished hydrating.
 *
 * `useSyncExternalStore` is used so the server render, the hydration render,
 * and the first client paint all agree: the hydration snapshot (`false`) is
 * what React uses while hydrating, and the store value (`true`) only lands
 * afterwards. A component that reads the clock can therefore render a stable
 * value on the server and the real value afterwards, without a hydration
 * mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
