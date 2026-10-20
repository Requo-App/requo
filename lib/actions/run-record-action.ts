import "server-only";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { getWorkspaceBusinessActionContext } from "@/lib/db/business-access";

/**
 * Shared orchestration for single-record dashboard actions
 * (inquiries, quotes, follow-ups): resolve the workspace context, run the
 * feature mutation, invalidate cache tags, and map the outcome to an
 * action state. Domain differences (locked messages, success predicates,
 * tag builders, redirect targets) stay with the caller as explicit inputs;
 * mutations and their transactions stay in the feature modules.
 */

export type RecordActionState = {
  error?: string;
  success?: string;
};

export type RecordActionContext = {
  businessId: string;
  actorUserId: string;
};

export type RecordActionOptions<TResult> = {
  runMutation: (context: RecordActionContext) => Promise<TResult | null>;
  /** Error when the mutation returns null (missing or foreign record). */
  missingError: string;
  /** Locked error for the result, or null when the record was mutable. */
  lockedError: (result: TResult) => string | null;
  /** Whether the mutation changed anything (vs a no-op repeat). */
  isSuccessful: (result: TResult) => boolean;
  /** Cache-tag invalidation for the mutated record. */
  invalidate: (result: TResult, businessId: string) => void;
  messages: {
    success: string;
    unchanged: string;
    fallbackError: string;
    genericError: string;
    redirectHref?: string;
  };
};

/**
 * Narrows a caller-supplied redirect target to a same-origin relative path.
 *
 * The value arrives from a hidden form input, so it is untrusted. Next
 * treats an absolute `redirect()` target as an external navigation, which
 * would turn a destructive action into an open redirect.
 */
export function getSafeInternalRedirectPath(
  value: string | null | undefined,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith("/") || trimmedValue.startsWith("//")) {
    return undefined;
  }

  // URL parsers treat a backslash as a slash, so "/\evil.example" would
  // navigate off-site.
  if (trimmedValue.includes("\\")) {
    return undefined;
  }

  // URL parsers strip control characters, which can turn a target that
  // looks local into one that is not.
  // Check the original input so trimming cannot hide leading/trailing controls.
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return undefined;
  }

  return trimmedValue;
}

export async function runRecordAction<
  TState extends RecordActionState,
  TResult,
>(options: RecordActionOptions<TResult>): Promise<TState> {
  const {
    runMutation,
    missingError,
    lockedError,
    isSuccessful,
    invalidate,
    messages,
  } = options;

  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    } as TState;
  }

  const { user, businessContext } = ownerAccess;

  let redirectTarget: string | null = null;

  try {
    const result = await runMutation({
      businessId: businessContext.business.id,
      actorUserId: user.id,
    });

    if (!result) {
      return {
        error: missingError,
      } as TState;
    }

    invalidate(result, businessContext.business.id);

    const locked = lockedError(result);

    if (locked) {
      return {
        error: locked,
      } as TState;
    }

    if (messages.redirectHref && isSuccessful(result)) {
      redirectTarget = getSafeInternalRedirectPath(messages.redirectHref) ?? null;
    } else {
      return {
        success: isSuccessful(result) ? messages.success : messages.unchanged,
      } as TState;
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }
    console.error(messages.fallbackError, error);

    return {
      error: messages.genericError,
    } as TState;
  }

  if (redirectTarget) {
    redirect(redirectTarget);
  }

  // Unreachable when redirectTarget is set (redirect throws); keeps the
  // return type satisfied for the non-redirect fall-through path.
  return {
    success: messages.success,
  } as TState;
}
