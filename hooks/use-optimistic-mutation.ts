"use client";

import { useCallback, useRef, useTransition } from "react";
import { toast } from "@/components/shared/notify";

import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { getFirstFieldError } from "@/hooks/use-action-state-with-sonner";

export type OptimisticActionResult = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  entity?: { id: string };
  affected?: number;
  skipped?: number;
};

type UseOptimisticMutationOptions<TResult extends OptimisticActionResult> = {
  applyOptimistic: () => void;
  revertOptimistic: () => void;
  mutation: () => Promise<TResult>;
  onSuccess?: (result: TResult) => void;
  onError?: (result: TResult) => void;
  pendingKey?: string;
  refreshOnSuccess?: boolean;
  successMessage?: string | ((result: TResult) => string | undefined);
  errorMessage?: string | ((result: TResult) => string | undefined);
};

function resolveErrorMessage<TResult extends OptimisticActionResult>(
  result: TResult,
  errorMessage?: string | ((result: TResult) => string | undefined),
) {
  if (typeof errorMessage === "function") {
    return errorMessage(result);
  }

  return (
    errorMessage ??
    getFirstFieldError(result.fieldErrors) ??
    result.error
  );
}

function resolveSuccessMessage<TResult extends OptimisticActionResult>(
  result: TResult,
  successMessage?: string | ((result: TResult) => string | undefined),
) {
  if (typeof successMessage === "function") {
    return successMessage(result);
  }

  return successMessage ?? result.success;
}

export function useOptimisticMutation() {
  const [isPending, startTransition] = useTransition();
  const { scheduleRefresh } = useDeferredRefresh();
  const pendingKeysRef = useRef(new Set<string>());

  const isPendingKey = useCallback((key: string) => {
    return pendingKeysRef.current.has(key);
  }, []);

  const runMutation = useCallback(
    <TResult extends OptimisticActionResult>({
      applyOptimistic,
      revertOptimistic,
      mutation,
      onSuccess,
      onError,
      pendingKey,
      refreshOnSuccess = true,
      successMessage,
      errorMessage,
    }: UseOptimisticMutationOptions<TResult>) => {
      if (pendingKey) {
        pendingKeysRef.current.add(pendingKey);
      }

      startTransition(async () => {
        applyOptimistic();

        try {
          const result = await mutation();
          const resolvedError = resolveErrorMessage(result, errorMessage);

          if (resolvedError) {
            revertOptimistic();
            toast.error(resolvedError);
            onError?.(result);
            return;
          }

          if (typeof result.affected === "number" && result.affected === 0) {
            revertOptimistic();
            const partialMessage =
              result.success ??
              "No items were updated. Eligible items may have changed.";
            toast.error(partialMessage);
            onError?.(result);
            return;
          }

          const resolvedSuccess = resolveSuccessMessage(result, successMessage);
          if (resolvedSuccess) {
            toast.success(resolvedSuccess);
          }

          onSuccess?.(result);

          if (refreshOnSuccess) {
            scheduleRefresh();
          }
        } catch {
          revertOptimistic();
          toast.error("Something went wrong. Please try again.");
        } finally {
          if (pendingKey) {
            pendingKeysRef.current.delete(pendingKey);
          }
        }
      });
    },
    [scheduleRefresh, startTransition],
  );

  return {
    runMutation,
    isPending,
    isPendingKey,
  };
}
