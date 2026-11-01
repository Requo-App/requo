/**
 * Client-side error reporting for React error boundaries.
 *
 * The browser bundle must stay free of a monitoring SDK on the happy path, so
 * the Sentry browser SDK is imported only after the first reported error. With
 * no `NEXT_PUBLIC_SENTRY_DSN` configured, reporting degrades to the console —
 * the same channel the boundaries used before this module existed.
 *
 * Privacy: quote and inquiry URLs carry opaque tokens in the pathname, and
 * fetch breadcrumbs capture URLs. Request context and breadcrumbs are stripped
 * before an event leaves the browser.
 */
type SentryModule = typeof import("@sentry/browser");

export type ClientErrorReport = {
  /** Which boundary caught the error, e.g. `dashboard-error`. */
  scope: string;
  /** Next's error digest, so the event matches the reference shown to users. */
  referenceId?: string;
  extra?: Record<string, unknown>;
};

let sentryPromise: Promise<SentryModule | null> | null = null;

function getDsn(): string | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

  return dsn ? dsn : null;
}

async function loadSentry(): Promise<SentryModule | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const dsn = getDsn();

  if (!dsn) {
    return null;
  }

  sentryPromise ??= import("@sentry/browser")
    .then((Sentry) => {
      if (!Sentry.getClient()) {
        Sentry.init({
          dsn,
          environment: process.env.NODE_ENV,
          tracesSampleRate: 0,
          beforeBreadcrumb: () => null,
          beforeSend(event) {
            delete event.request;
            event.breadcrumbs = [];
            return event;
          },
        });
      }

      return Sentry;
    })
    .catch(() => null);

  return sentryPromise;
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : "Unknown client error");
}

/** Next attaches the digest that the error boundary displays as a reference. */
export function getErrorReferenceId(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return undefined;
  }

  const digest = (error as { digest?: unknown }).digest;

  return typeof digest === "string" ? digest : undefined;
}

/**
 * Logs the error locally and, when a DSN is configured, captures it in Sentry.
 * Never throws: a reporting failure must not replace the boundary's fallback.
 */
export function reportClientError(
  error: unknown,
  report: ClientErrorReport,
): Promise<void> {
  const normalized = normalizeError(error);
  const referenceSuffix = report.referenceId
    ? ` ref=${report.referenceId}`
    : "";

  console.error(`[${report.scope}]${referenceSuffix}`, normalized);

  return loadSentry()
    .then((Sentry) => {
      if (!Sentry) {
        return;
      }

      Sentry.captureException(normalized, {
        tags: {
          scope: report.scope,
          ...(report.referenceId
            ? { reference_id: report.referenceId }
            : {}),
        },
        extra: report.extra,
      });
    })
    .catch(() => {
      // Error reporting must never throw out of an error boundary.
    });
}
