import { BrandLoadingMark } from "@/components/shared/brand-loading-screen";
import { RESERVED_ROUTE_SEGMENTS } from "@/lib/routing/reserved-segments";

/**
 * Dashboard sections that live below `/[businessSlug]`. A cold document load
 * into one of these paths is an app entry, not an in-app navigation, so it
 * gets the same brand loading screen as a browser refresh.
 */
const DASHBOARD_SECTIONS = [
  "home",
  "inquiries",
  "quotes",
  "discussions",
  "invoices",
  "payments",
  "follow-ups",
  "assistant",
  "services",
  "quote-library",
  "analytics",
  "notifications",
  "settings",
  "preview",
  "print",
  "products",
] as const;

/**
 * Critical CSS for the entry screen, rendered with the overlay instead of in
 * `globals.css`. The overlay covers the whole page, so it must stay hidden
 * even when the page stylesheet is stale or slow: otherwise a marketing page
 * would open behind a full-screen brand mark.
 */
const APP_LOADING_CRITICAL_CSS = `
  [data-app-loading-overlay] {
    display: none;
  }

  html[data-app-loading="true"] body {
    overflow: hidden;
  }

  html[data-app-loading="true"] #app-root-content {
    visibility: hidden;
  }

  html[data-app-loading="true"] [data-app-loading-overlay] {
    display: flex;
  }

  html[data-app-loading="fade-out"] [data-app-loading-overlay] {
    display: flex;
    animation: app-loading-fade-out var(--motion-duration-base, 150ms)
      var(--motion-ease-standard, ease) forwards;
  }

  html[data-app-loading="fade-out"] #app-root-content {
    visibility: visible;
    animation: app-loading-content-fade-in var(--motion-duration-base, 150ms)
      var(--motion-ease-standard, ease) forwards;
  }

  @keyframes app-loading-fade-out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
      pointer-events: none;
    }
  }

  @keyframes app-loading-content-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

/**
 * Full-page brand screen. Hidden by default; the init script reveals it before
 * paint on a refresh or a fresh document navigation into a dashboard.
 */
export function AppLoadingOverlay() {
  return (
    <>
      <style>{APP_LOADING_CRITICAL_CSS}</style>
      <div
        data-app-loading-overlay
        className="fixed inset-0 z-[200] items-center justify-center bg-background px-6"
      >
        <BrandLoadingMark />
      </div>
    </>
  );
}

/**
 * Runs before paint so the loading screen covers the initial dashboard render
 * instead of letting the shell skeleton flash first.
 *
 * It shows for every browser refresh, and for a fresh document navigation
 * into a business dashboard (for example, the landing page's Dashboard link).
 * Client-side dashboard navigation never runs this script, so sibling
 * transitions keep their instant shell and region skeletons.
 */
export function getAppLoadingInitScript() {
  return `
    (() => {
      const attributeName = "data-app-loading";
      const reservedSegments = ${JSON.stringify([...RESERVED_ROUTE_SEGMENTS])};
      const dashboardSections = ${JSON.stringify([...DASHBOARD_SECTIONS])};
      const navigationEntries =
        typeof window.performance?.getEntriesByType === "function"
          ? window.performance.getEntriesByType("navigation")
          : [];
      const navigationEntry = navigationEntries[0];

      if (!navigationEntry) {
        return;
      }

      const segments = window.location.pathname.split("/").filter(Boolean);
      const isDashboardEntry =
        segments.length >= 2 &&
        !reservedSegments.includes(segments[0]) &&
        dashboardSections.includes(segments[1]);
      const shouldShow =
        navigationEntry.type === "reload" ||
        (navigationEntry.type === "navigate" && isDashboardEntry);

      if (!shouldShow) {
        return;
      }

      let cleared = false;
      const clearLoadingState = () => {
        if (cleared) return;
        cleared = true;

        document.documentElement.setAttribute(attributeName, "fade-out");

        const finish = () => {
          if (
            document.documentElement.getAttribute(attributeName) === "fade-out"
          ) {
            document.documentElement.removeAttribute(attributeName);
          }
        };

        const overlay = document.querySelector("[data-app-loading-overlay]");
        overlay?.addEventListener("animationend", finish, { once: true });

        // Never leave the app covered when the animation is skipped, the
        // stylesheet is missing, or the overlay is not in the document yet.
        setTimeout(finish, 500);
      };

      document.documentElement.setAttribute(attributeName, "true");

      if (document.readyState === "complete") {
        clearLoadingState();
        return;
      }

      window.addEventListener("load", clearLoadingState, { once: true });
      window.addEventListener("pageshow", clearLoadingState, {
        once: true,
      });
    })();
  `;
}
