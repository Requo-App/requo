import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import {
  ErrorStateBackButton,
  ErrorStateFocus,
  ErrorStateReference,
  errorStateTitleId,
} from "@/components/shared/error-state-client";
import { Button } from "@/components/ui/button";
import { legalConfig } from "@/features/legal/config";
import { cn } from "@/lib/utils";

/** Every page-level failure is labelled by the HTTP status it represents. */
export type ErrorStateStatus = 401 | 403 | 404 | 429 | 500 | 503;

export type ErrorStateVariant =
  | "not-found"
  | "public-link"
  | "forbidden"
  | "unauthorized"
  | "error"
  | "rate-limited"
  | "unavailable";

/**
 * `app` is Requo's own surface; `public` is a customer on a business link.
 * Public pages never point into the dashboard.
 */
export type ErrorStateAudience = "app" | "public";

/**
 * `page` owns the viewport. `inline` fills the content area inside an
 * existing shell so navigation stays visible; it uses smaller numerals.
 */
export type ErrorStateLayout = "page" | "inline";

type ErrorStateCopy = {
  status: ErrorStateStatus;
  title: string;
  description: string;
};

/**
 * One source of copy for every failure surface. Plain, calm, sentence case,
 * no exclamation marks, no internal jargon, no trailing period on titles.
 *
 * `public-link` deliberately shares the 404 numeral with `not-found`: an
 * unknown link and a disabled link must look identical to a customer.
 */
export const errorStateVariants = {
  "not-found": {
    status: 404,
    title: "Page not found",
    description:
      "The link may be broken, or the page may have been moved or deleted.",
  },
  "public-link": {
    status: 404,
    title: "This page is no longer available",
    description:
      "The link may have expired or been turned off. Ask the business that shared it for a new one.",
  },
  forbidden: {
    status: 403,
    title: "You don't have access",
    description:
      "Your account doesn't have permission to view this. If that seems wrong, ask the business owner to update your access.",
  },
  unauthorized: {
    status: 401,
    title: "Please sign in again",
    description:
      "Your session may have expired or you signed out in another tab. Sign in to continue.",
  },
  error: {
    status: 500,
    title: "Something went wrong",
    description:
      "We hit a problem on our side. Try again, and if it keeps happening, let us know.",
  },
  "rate-limited": {
    status: 429,
    title: "Too many requests",
    description:
      "You've made too many requests in a short time. Wait a moment, then try again.",
  },
  unavailable: {
    status: 503,
    title: "Service unavailable",
    description:
      "Requo is temporarily unavailable. Try again in a moment, and if it keeps happening, let us know.",
  },
} satisfies Record<ErrorStateVariant, ErrorStateCopy>;

export type ErrorStateProps = {
  variant: ErrorStateVariant;
  audience?: ErrorStateAudience;
  layout?: ErrorStateLayout;
  /** Optional copy overrides; the variant config supplies the defaults. */
  title?: string;
  description?: string;
  /** Replaces the variant's default actions. Pass `null` to render none. */
  actions?: ReactNode;
  /** Next's error digest, shown with a copy button. Never a raw message. */
  referenceId?: string;
  homeHref?: string;
  homeLabel?: string;
  /** Called by the error variant's "Try again" action (Next's `reset`). */
  onRetry?: () => void;
  retryLabel?: string;
  /** Moves focus to the headline when a client boundary replaces content. */
  focusOnMount?: boolean;
  footer?: ReactNode;
  /** Extra content, e.g. the raw message shown in development only. */
  children?: ReactNode;
};

type DefaultActionOptions = {
  variant: ErrorStateVariant;
  audience: ErrorStateAudience;
  homeHref: string;
  homeLabel: string;
  onRetry?: () => void;
  retryLabel: string;
};

function defaultActions({
  variant,
  audience,
  homeHref,
  homeLabel,
  onRetry,
  retryLabel,
}: DefaultActionOptions): ReactNode {
  if (audience === "public") {
    return null;
  }

  const homeAction = (
    <Button asChild size="lg">
      <Link href={homeHref}>{homeLabel}</Link>
    </Button>
  );

  if (variant === "forbidden") {
    return (
      <>
        {homeAction}
        <Button asChild size="lg" variant="ghost">
          <a href={`mailto:${legalConfig.supportEmail}`}>Contact support</a>
        </Button>
      </>
    );
  }

  if (variant === "unauthorized") {
    return (
      <>
        <Button asChild size="lg">
          <Link href="/login">Sign in</Link>
        </Button>
        <ErrorStateBackButton fallbackHref={homeHref} />
      </>
    );
  }

  if (
    variant === "error" ||
    variant === "rate-limited" ||
    variant === "unavailable"
  ) {
    if (!onRetry) {
      return homeAction;
    }

    return (
      <>
        <Button onClick={onRetry} size="lg" type="button">
          {retryLabel}
        </Button>
        <Button asChild size="lg" variant="ghost">
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </>
    );
  }

  if (variant === "not-found") {
    return (
      <>
        {homeAction}
        <ErrorStateBackButton fallbackHref={homeHref} />
      </>
    );
  }

  return homeAction;
}

/**
 * The shared error/status view.
 *
 * Every error page is a thin wrapper around this component, so one centered
 * column, one oversized ghost numeral, one headline and one action pattern
 * cover the whole product. Variants differ only in their data: HTTP status,
 * title, description and actions.
 *
 * The numeral is decorative (the heading is the accessible name) and the
 * heading overlaps its lower edge by a fixed 25% of the numeral's font size at
 * every breakpoint. The inline layout uses the same composition at a smaller
 * scale.
 *
 * Usable from both server and client trees: server pages pass navigational
 * actions, client boundaries additionally pass `onRetry` and `referenceId`.
 */
export function ErrorState({
  variant,
  audience = "app",
  layout = "page",
  title,
  description,
  actions,
  referenceId,
  homeHref = "/",
  homeLabel = "Go to Requo",
  onRetry,
  retryLabel = "Try again",
  focusOnMount = false,
  footer,
  children,
}: ErrorStateProps) {
  const copy = errorStateVariants[variant];
  const isPage = layout === "page";
  // Keep `leading-none` after the size classes: tailwind-merge treats a
  // `text-*` size as owning line-height and drops an earlier override.
  const numeralSizeClass = isPage
    ? "text-[10rem] sm:text-[16rem] md:text-[20rem]"
    : "text-[7.5rem] sm:text-[10rem] md:text-[12rem]";
  const resolvedActions =
    actions !== undefined
      ? actions
      : defaultActions({
          variant,
          audience,
          homeHref,
          homeLabel,
          onRetry,
          retryLabel,
        });
  const resolvedFooter =
    footer !== undefined ? (
      footer
    ) : audience === "public" ? (
      <Link
        className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        href="/"
      >
        Powered by Requo
      </Link>
    ) : null;

  const content = (
    <div className="error-state-enter flex w-full max-w-[28rem] flex-col items-center text-center">
      <p
        aria-hidden="true"
        className={cn(
          "-mb-[0.25em] select-none font-heading font-black tracking-tighter text-foreground/[0.06]",
          numeralSizeClass,
          "leading-none",
        )}
        data-error-state-numeral=""
        data-status={copy.status}
      >
        {copy.status}
      </p>

      <h1
        className="text-balance font-heading text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        id={errorStateTitleId}
        tabIndex={-1}
      >
        {title ?? copy.title}
      </h1>
      {focusOnMount ? <ErrorStateFocus /> : null}

      <p className="mt-3 text-balance text-sm leading-6 text-muted-foreground sm:text-[0.9375rem] sm:leading-7">
        {description ?? copy.description}
      </p>

      {referenceId ? <ErrorStateReference referenceId={referenceId} /> : null}

      {resolvedActions ? (
        <div className="mt-8 flex w-full flex-col gap-2 sm:flex-row sm:justify-center sm:gap-3">
          {resolvedActions}
        </div>
      ) : null}

      {children ? <div className="mt-6 w-full">{children}</div> : null}

      {resolvedFooter ? (
        <div className="mt-10 text-xs text-muted-foreground">
          {resolvedFooter}
        </div>
      ) : null}
    </div>
  );

  if (isPage) {
    return (
      <main className="flex min-h-svh w-full flex-col items-center justify-center px-6 py-16">
        {content}
      </main>
    );
  }

  return (
    <div className="flex min-h-[50svh] w-full flex-col items-center justify-center px-6 py-12">
      {content}
    </div>
  );
}

export type ErrorStateNoticeProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

/**
 * Compact in-place notice for a failed page region or lazy chunk.
 *
 * Shares the error vocabulary without the page composition: no numeral and no
 * heading, so it can sit inside an existing section without competing with the
 * page's single `h1`. Announced immediately as an alert.
 */
export function ErrorStateNotice({
  title,
  description,
  actions,
  className,
}: ErrorStateNoticeProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      role="alert"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-destructive-ink"
        />
        <div className="min-w-0">
          {title ? (
            <p className="text-sm font-medium leading-5 text-foreground">
              {title}
            </p>
          ) : null}
          {description ? (
            <p
              className={cn(
                "text-sm leading-5",
                title ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
