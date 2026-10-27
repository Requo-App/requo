import Image from "next/image";

import { BrandWordmark } from "@/components/shared/brand-wordmark";
import { Spinner } from "@/components/ui/spinner";

export function ReloadLoadingOverlay() {
  return (
    <div
      data-reload-loading-overlay
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

export function getReloadLoadingInitScript() {
  return `
    (() => {
      const attributeName = "data-reload-loading";
      const navigationEntries =
        typeof window.performance?.getEntriesByType === "function"
          ? window.performance.getEntriesByType("navigation")
          : [];
      const navigationEntry = navigationEntries[0];

      if (!navigationEntry || navigationEntry.type !== "reload") {
        return;
      }

      const clearReloadLoadingState = () => {
        const currentValue = document.documentElement.getAttribute(attributeName);
        if (!currentValue) return;

        document.documentElement.setAttribute(attributeName, "fade-out");

        const overlay = document.querySelector("[data-reload-loading-overlay]");
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
        clearReloadLoadingState();
        return;
      }

      window.addEventListener("load", clearReloadLoadingState, { once: true });
      window.addEventListener("pageshow", clearReloadLoadingState, {
        once: true,
      });
    })();
  `;
}
