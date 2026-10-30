import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import {
  AppLoadingOverlay,
  getAppLoadingInitScript,
} from "@/components/shared/app-loading-overlay";

/**
 * The app loading screen has to be on screen before the first dashboard paint,
 * so its decision runs in a beforeInteractive script. These tests execute that
 * script against the initial document state instead of re-implementing the
 * path rules in the test.
 */

type NavigationType = "back_forward" | "navigate" | "reload";

function runInitScript({
  navigationType,
  pathname,
}: {
  navigationType: NavigationType;
  pathname: string;
}) {
  window.history.replaceState({}, "", pathname);
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => "loading",
  });
  vi.spyOn(window.performance, "getEntriesByType").mockReturnValue([
    { type: navigationType } as unknown as PerformanceEntry,
  ]);

  new Function(getAppLoadingInitScript())();
}

beforeEach(() => {
  document.documentElement.removeAttribute("data-app-loading");
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-app-loading");
});

describe("getAppLoadingInitScript", () => {
  it("covers a refresh from any route", () => {
    runInitScript({ navigationType: "reload", pathname: "/pricing" });

    expect(document.documentElement).toHaveAttribute("data-app-loading", "true");
  });

  it.each(["/acme/home", "/acme/inquiries/123", "/acme/settings/billing"])(
    "covers a cold document entry into the dashboard at %s",
    (pathname) => {
      runInitScript({ navigationType: "navigate", pathname });

      expect(document.documentElement).toHaveAttribute(
        "data-app-loading",
        "true",
      );
    },
  );

  it.each(["/", "/pricing", "/solutions/contractors", "/login"])(
    "leaves a cold document entry into %s alone",
    (pathname) => {
      runInitScript({ navigationType: "navigate", pathname });

      expect(document.documentElement).not.toHaveAttribute("data-app-loading");
    },
  );

  it("leaves back/forward navigation alone even inside the dashboard", () => {
    runInitScript({ navigationType: "back_forward", pathname: "/acme/home" });

    expect(document.documentElement).not.toHaveAttribute("data-app-loading");
  });

  it("fades the brand screen out and reveals the app after load", () => {
    const { container } = render(<AppLoadingOverlay />);
    runInitScript({ navigationType: "navigate", pathname: "/acme/home" });

    expect(document.documentElement).toHaveAttribute("data-app-loading", "true");

    fireEvent.load(window);
    expect(document.documentElement).toHaveAttribute(
      "data-app-loading",
      "fade-out",
    );

    const overlay = container.querySelector("[data-app-loading-overlay]");
    expect(overlay).not.toBeNull();

    fireEvent.animationEnd(overlay!);
    expect(document.documentElement).not.toHaveAttribute("data-app-loading");
  });
});
