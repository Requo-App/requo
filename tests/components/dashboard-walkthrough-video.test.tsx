import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DashboardWalkthroughVideo } from "@/components/marketing/dashboard-walkthrough-video";

/**
 * Hero walkthrough stage tests.
 *
 * The stage exists to keep the recorded clip cheap. It must not mount a video
 * before the browser proves it can play the codec and the stage nears the
 * viewport, and it must stop decoding whenever the visitor cannot see it:
 * scrolled away or hidden tab. Manually pausing always wins over the
 * autoplay/auto-resume rules, and reduced motion keeps the static stage with
 * no clip and no control at all.
 */

type ObserverCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver,
) => void;

let observerCallback: ObserverCallback | null = null;

class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: number[] = [];

  constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }

  disconnect() {}

  observe() {
    // Intersection is driven explicitly by `emitIntersection`.
  }

  takeRecords() {
    return [];
  }

  unobserve() {}
}

const playSpy = vi.fn();
const pauseSpy = vi.fn();

beforeEach(() => {
  observerCallback = null;
  playSpy.mockClear();
  pauseSpy.mockClear();

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

  Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", {
    configurable: true,
    value: () => "maybe",
  });

  // jsdom implements no media playback: record the calls and fire the events
  // a real browser would, so the component's own play/pause state follows.
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: function play(this: HTMLMediaElement) {
      playSpy();
      this.dispatchEvent(new Event("play"));

      return Promise.resolve();
    },
  });

  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: function pause(this: HTMLMediaElement) {
      pauseSpy();
      this.dispatchEvent(new Event("pause"));
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function emitIntersection(ratio: number) {
  await act(async () => {
    observerCallback?.(
      [
        {
          isIntersecting: ratio > 0,
          intersectionRatio: ratio,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
  });
}

async function setDocumentVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => value,
  });

  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("DashboardWalkthroughVideo", () => {
  it("holds the clip back until the stage nears the viewport", async () => {
    const { container } = render(<DashboardWalkthroughVideo />);

    // Session start: the static recreation only, no media element, no fetch.
    expect(container.querySelector("video")).toBeNull();
    expect(playSpy).not.toHaveBeenCalled();

    await emitIntersection(1);

    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });
    expect(playSpy).toHaveBeenCalled();
  });

  it("stops decoding once the stage scrolls out of view", async () => {
    render(<DashboardWalkthroughVideo />);
    await emitIntersection(1);
    await waitFor(() => expect(playSpy).toHaveBeenCalled());

    pauseSpy.mockClear();
    await emitIntersection(0.1);

    expect(pauseSpy).toHaveBeenCalled();
  });

  it("pauses while the tab is hidden and resumes when it returns", async () => {
    render(<DashboardWalkthroughVideo />);
    await emitIntersection(1);
    await waitFor(() => expect(playSpy).toHaveBeenCalled());

    pauseSpy.mockClear();
    playSpy.mockClear();

    await setDocumentVisibility("hidden");
    expect(pauseSpy).toHaveBeenCalled();

    await setDocumentVisibility("visible");
    expect(playSpy).toHaveBeenCalled();
  });

  it("pauses and resumes from the stage control", async () => {
    const user = userEvent.setup();
    render(<DashboardWalkthroughVideo />);
    await emitIntersection(1);

    const pauseButton = await screen.findByRole("button", {
      name: "Pause the walkthrough",
    });

    pauseSpy.mockClear();
    await user.click(pauseButton);
    expect(pauseSpy).toHaveBeenCalled();

    const playButton = await screen.findByRole("button", {
      name: "Play the walkthrough",
    });

    playSpy.mockClear();
    await user.click(playButton);
    expect(playSpy).toHaveBeenCalled();
  });

  it("exposes nothing over the preview but the play/pause control", async () => {
    render(<DashboardWalkthroughVideo />);
    await emitIntersection(1);
    await waitFor(() => expect(playSpy).toHaveBeenCalled());

    // No dialog, no full-surface trigger: the preview stays passive.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /full size/i })).toBeNull();

    const control = screen.getByRole("button", { name: "Pause the walkthrough" });
    expect(control.querySelector("svg")).not.toBeNull();
  });

  it("keeps the static stage, with no clip and no control, under reduced motion", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));

    const { container } = render(<DashboardWalkthroughVideo />);
    await emitIntersection(1);

    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByRole("button", { name: /walkthrough/i })).toBeNull();
    expect(playSpy).not.toHaveBeenCalled();
  });
});
