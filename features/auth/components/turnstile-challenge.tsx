"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_ACTION = "auth";
// Turnstile's `flexible` size has a 300px minimum; the auth card content is
// narrower than that on small phones, so use `compact` (150x140) there.
const TURNSTILE_COMPACT_MAX_WIDTH = 374;

type TurnstileRenderOptions = {
  sitekey: string;
  action: string;
  size: "compact" | "flexible";
  theme: "auto";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "timeout-callback": () => void;
  "error-callback": () => void;
};

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileScriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstileScript(): Promise<TurnstileApi> {
  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existingScript = document.getElementById(
      TURNSTILE_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    const script = existingScript ?? document.createElement("script");

    function cleanupListeners() {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    }

    function handleLoad() {
      cleanupListeners();

      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }

      reject(new Error("Turnstile loaded without exposing its API."));
    }

    function handleError() {
      cleanupListeners();
      script.remove();
      reject(new Error("Turnstile script failed to load."));
    }

    if (!existingScript) {
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
    }

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (!existingScript) {
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    // Allow a later mount to retry instead of caching the failure forever.
    turnstileScriptPromise = null;
    throw error;
  });

  return turnstileScriptPromise;
}

export type TurnstileChallengeHandle = {
  /** Current token, or null before verification, after expiry, or after reset. */
  getToken: () => string | null;
  /** Clear the token and render a fresh challenge after a consumed token. */
  reset: () => void;
};

type TurnstileChallengeProps = {
  siteKey: string;
  className?: string;
};

/**
 * Cloudflare Turnstile widget for the password auth forms. The caller renders
 * this only when `getTurnstileConfig()` resolved a site key, so an unconfigured
 * deployment never loads the third-party script.
 */
export const TurnstileChallenge = forwardRef<
  TurnstileChallengeHandle,
  TurnstileChallengeProps
>(function TurnstileChallenge({ siteKey, className }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useImperativeHandle(
    ref,
    () => ({
      getToken: () => tokenRef.current,
      reset: () => {
        tokenRef.current = null;

        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    tokenRef.current = null;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        containerRef.current.replaceChildren();
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: TURNSTILE_ACTION,
          size:
            window.innerWidth <= TURNSTILE_COMPACT_MAX_WIDTH
              ? "compact"
              : "flexible",
          theme: "auto",
          callback: (token) => {
            if (cancelled) {
              return;
            }

            tokenRef.current = token;
            setStatus("ready");
          },
          "expired-callback": () => {
            tokenRef.current = null;
          },
          "timeout-callback": () => {
            tokenRef.current = null;
          },
          "error-callback": () => {
            tokenRef.current = null;

            if (!cancelled) {
              setStatus("error");
            }
          },
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
      tokenRef.current = null;

      const widgetId = widgetIdRef.current;
      widgetIdRef.current = null;

      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [siteKey]);

  return (
    <div className={cn("min-h-[65px]", className)}>
      <div ref={containerRef} />
      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">
          Loading security check…
        </p>
      ) : null}
      {status === "error" ? (
        <p className="text-sm text-destructive-ink" role="status">
          The security check could not load. Refresh the page and try again.
        </p>
      ) : null}
    </div>
  );
});

/**
 * Header expected by Better Auth's captcha plugin. Returns an empty object
 * when the challenge is disabled or has no token, so callers can spread it
 * into auth requests without changing the unconfigured shape.
 */
export function getTurnstileFetchOptions(token: string | null) {
  return token
    ? {
        fetchOptions: {
          headers: {
            "x-captcha-response": token,
          },
        },
      }
    : {};
}
