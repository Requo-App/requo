"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Global error boundary. Replaces the root layout when an uncaught error
 * propagates through it, so it must include its own `<html>` and `<body>`
 * elements per Next.js docs.
 *
 * Kept intentionally minimal and free of providers/context so it never
 * fails to render — its job is to recover gracefully when the rest of
 * the tree has already failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Send to your error tracker here if you wire one up.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#ffffff",
          color: "#1d1d1f",
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <div
          style={{
            maxWidth: "32rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              margin: 0,
            }}
          >
            Something went wrong
          </h1>
          <p style={{ color: "#6e6e73", margin: 0, lineHeight: 1.6 }}>
            We hit an unexpected error. You can try again, and if it keeps
            happening, please reload the page.
          </p>
          {error.digest ? (
            <p
              style={{
                color: "#a1a1a6",
                fontSize: "0.75rem",
                margin: 0,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              marginTop: "0.5rem",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid #e5e5ea",
                background: "#fff",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid transparent",
                background: "#1d1d1f",
                color: "#f5f5f7",
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Go home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
