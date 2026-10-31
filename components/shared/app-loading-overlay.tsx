import Image from "next/image";

import { BrandWordmark } from "@/components/shared/brand-wordmark";
import { Spinner } from "@/components/ui/spinner";
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

export function AppLoadingOverlay() {
  return (
    <div
      data-app-loading-overlay
      className="fixed inset-0 z-[200] items-center justify-center bg-background px-6"
    >
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-4">
          <Image
            src="/logo.svg"
            alt="Requo"
            width={64}
            height={64}
            className="size-16 object-contain"
          />
          <BrandWordmark size="hero" />
        </div>
        <Spinner className="size-5 text-primary-ink" />
      </div>
    </div>
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

      const clearLoadingState = () => {
        const currentValue = document.documentElement.getAttribute(attributeName);
        if (!currentValue) return;

        document.documentElement.setAttribute(attributeName, "fade-out");

        const overlay = document.querySelector("[data-app-loading-overlay]");
        if (overlay) {
          overlay.addEventListener("animationend", () => {
            document.documentElement.removeAttribute(attributeName);
          }, { once: true });
        } else {
          setTimeout(() => {
            document.documentElement.removeAttribute(attributeName);
          }, 300);
        }
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
