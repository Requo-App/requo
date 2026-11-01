"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { errorStateDocumentCss } from "@/components/shared/error-state-document";
import { reportClientError } from "@/lib/observability/client";

/**
 * Global error boundary. Replaces the root layout when an uncaught error
 * propagates through it, so it must include its own `<html>` and `<body>`
 * elements per Next.js docs.
 *
 * Deliberately self-contained: no providers, theme context, stylesheet or data
 * fetching, because the rest of the tree has already failed. It inlines the
 * shared error-document CSS and follows the system colour scheme, which is the
 * only theme signal available without the app's theme script. The design
 * matches `ErrorState` (the in-app version) and the proxy 403 document.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void reportClientError(error, {
      scope: "global-error",
      referenceId: error.digest,
    });
  }, [error]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeout = window.setTimeout(() => setCopied(false), 2_000);

    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyReference() {
    if (!error.digest) {
      return;
    }

    try {
      await navigator.clipboard.writeText(error.digest);
      setCopied(true);
    } catch {
      // Clipboard access can be denied; the digest stays selectable text.
    }
  }

  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Requo</title>
        <meta content="noindex, nofollow" name="robots" />
        <style>{errorStateDocumentCss}</style>
      </head>
      <body>
        <main className="error-doc">
          <div className="error-doc-column">
            <p aria-hidden="true" className="error-doc-numeral">
              500
            </p>

            <h1 className="error-doc-title">Something went wrong</h1>
            <p className="error-doc-description">
              We hit a problem on our side. Try again, and if it keeps
              happening, let us know.
            </p>

            {error.digest ? (
              <div className="error-doc-reference">
                <span>
                  Reference: <code>{error.digest}</code>
                </span>
                <button
                  className="error-doc-copy"
                  onClick={copyReference}
                  type="button"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : null}

            <div className="error-doc-actions">
              <button
                className="error-doc-primary"
                onClick={reset}
                type="button"
              >
                Try again
              </button>
              <Link className="error-doc-secondary" href="/">
                Go to Requo
              </Link>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
