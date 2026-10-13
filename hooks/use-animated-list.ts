import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  type OptimisticActionResult,
  useOptimisticMutation,
} from "@/hooks/use-optimistic-mutation";

/**
 * Motion state applied via `data-motion-state` on each list element.
 * Works with the existing `.motion-list-item` CSS utility in globals.css.
 */
export type MotionState = "entering" | "exiting" | "updating" | undefined;

export type ItemRefCallback = (id: string) => (node: HTMLElement | null) => void;

type AnimatedListAction<T extends { id: string }> =
  | { type: "add"; item: T }
  | { type: "remove"; id: string }
  | { type: "remove-many"; ids: string[] }
  | { type: "restore"; item: T }
  | { type: "restore-many"; items: T[] }
  | { type: "update"; id: string; patch: Partial<T> }
  | { type: "replace"; tempId: string; item: T }
  | { type: "move"; id: string; toIndex: number };

const EXIT_DURATION_MS = 280;
const UPDATE_DURATION_MS = 220;
const FLIP_DURATION_MS = 220;
const FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Shared with bespoke lists (e.g. FollowUpBoard) so exit timing never drifts. */
export const LIST_EXIT_MS = EXIT_DURATION_MS;
export const LIST_UPDATE_MS = UPDATE_DURATION_MS;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * FLIP sibling movement for user-initiated list changes.
 *
 * Call `bump()` when a user mutation commits (add/remove/move), never on
 * routine server refreshes. On the next layout pass, elements whose vertical
 * position changed play a restrained translate-back animation via the Web
 * Animations API — no extra deps, no per-frame React renders. Exiting
 * elements keep their own CSS exit; only survivors move.
 */
export function useListFlip() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  const epoch = useRef(0);
  const playedEpoch = useRef(0);

  const getItemRef = useCallback<ItemRefCallback>(
    (id) => (node) => {
      if (node) {
        nodes.current.set(id, node);
      } else {
        nodes.current.delete(id);
        tops.current.delete(id);
      }
    },
    [],
  );

  const bump = useCallback(() => {
    epoch.current += 1;
  }, []);

  useLayoutEffect(() => {
    if (playedEpoch.current === epoch.current) {
      // Background refresh or first mount: record positions, animate nothing.
      for (const [id, node] of nodes.current) {
        tops.current.set(id, node.getBoundingClientRect().top);
      }
      return;
    }
    playedEpoch.current = epoch.current;
    if (prefersReducedMotion()) {
      for (const [id, node] of nodes.current) {
        tops.current.set(id, node.getBoundingClientRect().top);
      }
      return;
    }
    for (const [id, node] of nodes.current) {
      const prev = tops.current.get(id);
      const next = node.getBoundingClientRect().top;
      tops.current.set(id, next);
      if (prev === undefined) continue;
      const delta = prev - next;
      if (Math.abs(delta) < 3) continue;
      // Optional-chained: jsdom and older browsers lack Element.animate.
      node.animate?.(
        [
          { transform: `translateY(${delta}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: FLIP_DURATION_MS, easing: FLIP_EASING },
      );
    }
    // Drop positions for unmounted ids.
    for (const id of [...tops.current.keys()]) {
      if (!nodes.current.has(id)) {
        tops.current.delete(id);
      }
    }
  });

  return { getItemRef, bumpFlip: bump };
}

function moveItemInList<T extends { id: string }>(
  items: T[],
  id: string,
  toIndex: number,
) {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex === -1 || fromIndex === toIndex) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Manages an optimistic list with animated enter/exit/update transitions.
 *
 * Pairs with the `.motion-list-item` CSS class: consumers apply
 * `className="motion-list-item"` and `data-motion-state={getMotionState(id)}`
 * on each rendered item.
 */
export function useAnimatedList<T extends { id: string }>(serverItems: T[]) {
  const [, startTransition] = useTransition();
  const { runMutation, isPendingKey } = useOptimisticMutation();
  const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const updateTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const { getItemRef, bumpFlip } = useListFlip();

  // Never leave exit/update timers firing after unmount.
  useEffect(() => {
    const exits = exitTimers.current;
    const updates = updateTimers.current;
    return () => {
      for (const timer of exits.values()) clearTimeout(timer);
      for (const timer of updates.values()) clearTimeout(timer);
      exits.clear();
      updates.clear();
    };
  }, []);

  const [optimisticItems, dispatch] = useOptimistic(
    serverItems,
    (current: T[], action: AnimatedListAction<T>) => {
      switch (action.type) {
        case "add":
          return [action.item, ...current];
        case "remove":
          return current.filter((item) => item.id !== action.id);
        case "remove-many":
          return current.filter((item) => !action.ids.includes(item.id));
        case "restore":
          if (current.some((item) => item.id === action.item.id)) {
            return current;
          }
          return [action.item, ...current];
        case "restore-many": {
          const existingIds = new Set(current.map((item) => item.id));
          const restored = action.items.filter((item) => !existingIds.has(item.id));
          return [...restored, ...current];
        }
        case "update":
          return current.map((item) =>
            item.id === action.id ? { ...item, ...action.patch } : item,
          );
        case "replace":
          return current.map((item) =>
            item.id === action.tempId ? action.item : item,
          );
        case "move":
          return moveItemInList(current, action.id, action.toIndex);
        default:
          return current;
      }
    },
  );

  const enteringIds = useRef(new Set<string>());
  const exitingIds = useRef(new Set<string>());
  const updatingIds = useRef(new Set<string>());
  const [, bumpRender] = useState(0);

  const getMotionState = useCallback((id: string): MotionState => {
    if (exitingIds.current.has(id)) return "exiting";
    if (updatingIds.current.has(id)) return "updating";
    if (enteringIds.current.has(id)) return "entering";
    return undefined;
  }, []);

  const triggerRender = useCallback(() => {
    bumpRender((n) => n + 1);
  }, []);

  const markEntering = useCallback((id: string) => {
    enteringIds.current.add(id);
    triggerRender();
    setTimeout(() => {
      enteringIds.current.delete(id);
      triggerRender();
    }, EXIT_DURATION_MS);
  }, [triggerRender]);

  const markUpdating = useCallback((id: string) => {
    const prev = updateTimers.current.get(id);
    if (prev) clearTimeout(prev);

    updatingIds.current.add(id);
    triggerRender();

    const timer = setTimeout(() => {
      updatingIds.current.delete(id);
      updateTimers.current.delete(id);
      triggerRender();
    }, UPDATE_DURATION_MS);

    updateTimers.current.set(id, timer);
  }, [triggerRender]);

  const addItem = useCallback(
    (
      item: T,
      mutation?: () => Promise<OptimisticActionResult>,
      options?: {
        onSuccess?: (result: OptimisticActionResult) => void;
        replaceWithEntity?: (result: OptimisticActionResult, tempId: string) => T | null;
      },
    ) => {
      markEntering(item.id);
      dispatch({ type: "add", item });
      bumpFlip();

      if (!mutation) {
        return;
      }

      runMutation({
        applyOptimistic: () => {},
        revertOptimistic: () => {
          dispatch({ type: "remove", id: item.id });
        },
        mutation,
        pendingKey: item.id,
        onSuccess: (result) => {
          const replacement = options?.replaceWithEntity?.(result, item.id);
          if (replacement) {
            dispatch({ type: "replace", tempId: item.id, item: replacement });
          }
          options?.onSuccess?.(result);
        },
      });
    },
    [dispatch, markEntering, runMutation, bumpFlip],
  );

  const updateItem = useCallback(
    (
      id: string,
      patch: Partial<T>,
      mutation?: () => Promise<OptimisticActionResult>,
    ) => {
      const previous = optimisticItems.find((item) => item.id === id);
      if (!previous) {
        return;
      }

      markUpdating(id);
      dispatch({ type: "update", id, patch });

      if (!mutation) {
        return;
      }

      runMutation({
        applyOptimistic: () => {},
        revertOptimistic: () => {
          dispatch({ type: "update", id, patch: previous });
        },
        mutation,
        pendingKey: id,
      });
    },
    [dispatch, markUpdating, optimisticItems, runMutation],
  );

  const replaceItem = useCallback(
    (tempId: string, item: T) => {
      markEntering(item.id);
      dispatch({ type: "replace", tempId, item });
    },
    [dispatch, markEntering],
  );

  const moveItem = useCallback(
    (
      id: string,
      toIndex: number,
      mutation?: () => Promise<OptimisticActionResult>,
    ) => {
      const snapshot = [...optimisticItems];
      dispatch({ type: "move", id, toIndex });
      bumpFlip();

      if (!mutation) {
        return;
      }

      runMutation({
        applyOptimistic: () => {},
        revertOptimistic: () => {
          for (let index = 0; index < snapshot.length; index += 1) {
            const item = snapshot[index];
            dispatch({ type: "move", id: item.id, toIndex: index });
          }
        },
        mutation,
        pendingKey: id,
      });
    },
    [dispatch, optimisticItems, runMutation, bumpFlip],
  );

  const removeItem = useCallback(
    (
      id: string,
      mutation?: () => Promise<OptimisticActionResult>,
    ) => {
      const previous = optimisticItems.find((item) => item.id === id);
      if (!previous) {
        return;
      }

      const prev = exitTimers.current.get(id);
      if (prev) clearTimeout(prev);

      exitingIds.current.add(id);
      triggerRender();

      const timer = setTimeout(() => {
        exitingIds.current.delete(id);
        exitTimers.current.delete(id);
        triggerRender();

        startTransition(() => {
          dispatch({ type: "remove", id });
        });
        bumpFlip();

        if (!mutation) {
          return;
        }

        runMutation({
          applyOptimistic: () => {},
          revertOptimistic: () => {
            dispatch({ type: "restore", item: previous });
          },
          mutation,
          pendingKey: id,
        });
      }, EXIT_DURATION_MS);

      exitTimers.current.set(id, timer);
    },
    [dispatch, optimisticItems, runMutation, startTransition, triggerRender, bumpFlip],
  );

  const removeItems = useCallback(
    (
      ids: string[],
      mutation?: () => Promise<OptimisticActionResult>,
    ) => {
      const previousItems = optimisticItems.filter((item) => ids.includes(item.id));
      if (previousItems.length === 0) {
        return;
      }

      for (const id of ids) {
        const prev = exitTimers.current.get(id);
        if (prev) clearTimeout(prev);
        exitingIds.current.add(id);
      }
      triggerRender();

      const timer = setTimeout(() => {
        for (const id of ids) {
          exitingIds.current.delete(id);
          exitTimers.current.delete(id);
        }
        triggerRender();

        startTransition(() => {
          dispatch({ type: "remove-many", ids });
        });
        bumpFlip();

        if (!mutation) {
          return;
        }

        runMutation({
          applyOptimistic: () => {},
          revertOptimistic: () => {
            dispatch({ type: "restore-many", items: previousItems });
          },
          mutation,
          pendingKey: ids.join(","),
        });
      }, EXIT_DURATION_MS);

      for (const id of ids) {
        exitTimers.current.set(id, timer);
      }
    },
    [dispatch, optimisticItems, runMutation, startTransition, triggerRender, bumpFlip],
  );

  return {
    items: optimisticItems,
    getMotionState,
    getItemRef,
    isPendingKey,
    addItem,
    updateItem,
    replaceItem,
    moveItem,
    removeItem,
    removeItems,
  };
}
