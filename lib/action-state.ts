import type { z } from "zod";

export type ActionFieldErrors = Record<string, string[] | undefined>;

export function getValidationActionState<
  TFieldErrors extends ActionFieldErrors,
  TState extends {
    error?: string;
    fieldErrors?: TFieldErrors;
  },
>(
  error: z.ZodError,
  message: string,
  mapFieldErrors?: (fieldErrors: ActionFieldErrors) => TFieldErrors,
): TState {
  const fieldErrors = error.flatten().fieldErrors;

  return {
    error: message,
    fieldErrors: mapFieldErrors
      ? mapFieldErrors(fieldErrors)
      : (fieldErrors as TFieldErrors),
  } as TState;
}

export function getFieldError<TFieldErrors extends ActionFieldErrors>(
  fieldErrors: TFieldErrors | undefined,
  field: keyof TFieldErrors,
) {
  return fieldErrors?.[field]?.[0];
}

/**
 * Masks an error message that is safe to show to the user.
 *
 * Internal failures ("Failed to connect to …") and raw validation internals
 * ("Invalid input: expected number, received NaN") never reach the UI — the
 * owner sees the fallback copy instead.
 */
export function getUserSafeErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (/^Failed to /i.test(error.message)) {
    return fallback;
  }

  if (/^Invalid (input|option|type|value|enum|union|literal)/i.test(error.message)) {
    return fallback;
  }

  return error.message || fallback;
}
