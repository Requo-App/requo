"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getErrorReferenceId,
  reportClientError,
} from "@/lib/observability/client";

/** The single `h1` every error state renders, so client views can focus it. */
export const errorStateTitleId = "error-state-title";

/**
 * Reports a boundary failure to the console and, when configured, to Sentry.
 * The boundary shows Next's digest, so the event and the reference match.
 */
export function useErrorReport(scope: string, error: unknown) {
  useEffect(() => {
    void reportClientError(error, {
      scope,
      referenceId: getErrorReferenceId(error),
    });
  }, [error, scope]);
}

/**
 * Moves focus to the error headline when a client-side boundary renders.
 * A fresh document load already announces the page title, so this only runs
 * for error views that replace content in an already-mounted document.
 */
export function ErrorStateFocus() {
  useEffect(() => {
    document.getElementById(errorStateTitleId)?.focus({ preventScroll: true });
  }, []);

  return null;
}

/**
 * "Go back" needs history, so it is a client island. When the document has no
 * earlier entry (a direct visit to a dead URL), it falls back to the home href
 * instead of leaving the app.
 */
export function ErrorStateBackButton({
  fallbackHref,
}: {
  fallbackHref: string;
}) {
  const router = useRouter();

  return (
    <Button
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }

        router.push(fallbackHref);
      }}
      size="lg"
      type="button"
      variant="ghost"
    >
      Go back
    </Button>
  );
}

/**
 * Reference IDs let support match a report to a log line. The value is
 * Next's error digest — never the raw error message.
 */
export function ErrorStateReference({ referenceId }: { referenceId: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 2_000);

    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(referenceId);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the ID stays selectable text.
    }
  }

  return (
    <div className="mt-5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
      <span>
        Reference:{" "}
        <span className="font-mono text-xs">{referenceId}</span>
      </span>
      <button
        aria-label="Copy reference"
        className="rounded-sm px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={copyReference}
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Reference copied" : ""}
      </span>
    </div>
  );
}
