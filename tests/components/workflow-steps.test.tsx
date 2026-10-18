import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkflowSteps } from "@/components/marketing/workflow-steps";

/**
 * "How it works" stepper tests.
 *
 * The stepper advances on its own, so these pin the contract that keeps it
 * safe: the bar runs only while the stepper is in view on a visible tab, a
 * click selects a step (and re-selecting the current one restarts its bar),
 * the cycle hands on when the active bar fills — even if it fills exactly as
 * the stepper leaves view — wraps at the end, and reduced motion keeps the
 * manual stepper with a settled bar and no cycle.
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

beforeEach(() => {
  observerCallback = null;

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
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

function progressBarOf(stepName: RegExp) {
  const bar = screen
    .getByRole("button", { name: stepName })
    .querySelector("[data-workflow-progress]");

  expect(bar).not.toBeNull();

  return bar as HTMLElement;
}

/**
 * End the active bar's fill.
 *
 * React resolves the animation event through vendor-prefix detection and
 * jsdom ships no `AnimationEvent`, so it listens on the prefixed
 * `webkitAnimationEnd` there. Dispatch both names; the one React did not bind
 * is ignored. In a browser the CSS animation fires `animationend` itself.
 */
async function finishProgressBar(bar: HTMLElement) {
  await act(async () => {
    fireEvent(bar, new Event("animationend", { bubbles: true }));
    fireEvent(bar, new Event("webkitAnimationEnd", { bubbles: true }));
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

describe("WorkflowSteps", () => {
  it("keeps every step readable and marks the first one current", () => {
    render(<WorkflowSteps />);

    expect(
      screen.getByRole("button", { name: /Request comes in/ }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByRole("button", { name: /Quote sent same day/ }),
    ).not.toHaveAttribute("aria-current");

    // The inactive steps' copy stays in the document at full contrast — tone
    // only — so the journey reads top to bottom without interaction.
    expect(
      screen.getByText(/Scheduled reminders keep the next step/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/See accepted quotes instantly/),
    ).toBeInTheDocument();

    // The stage shows the active step's preview.
    expect(screen.getByText("Sarah Jenkins")).toBeInTheDocument();
  });

  it("hands the cycle to the next step when the active bar fills", async () => {
    render(<WorkflowSteps />);
    await emitIntersection(1);

    const firstBar = progressBarOf(/Request comes in/);

    expect(firstBar).toHaveAttribute("data-workflow-progress", "running");

    await finishProgressBar(firstBar);

    expect(
      screen.getByRole("button", { name: /Quote sent same day/ }),
    ).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Send quote")).toBeInTheDocument();
  });

  it("hands a finished bar on even when the stepper leaves view as it fills", async () => {
    render(<WorkflowSteps />);
    await emitIntersection(1);

    const firstBar = progressBarOf(/Request comes in/);

    // The fill can end in the same task the gate closes (scroll-out or hidden
    // tab), so the queued `animationend` arrives after the pause commits.
    await emitIntersection(0.1);
    await finishProgressBar(firstBar);

    expect(
      screen.getByRole("button", { name: /Quote sent same day/ }),
    ).toHaveAttribute("aria-current", "step");
  });

  it("runs the bar only while the stepper is in view", async () => {
    render(<WorkflowSteps />);

    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "paused",
    );

    await emitIntersection(1);

    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "running",
    );

    await emitIntersection(0.1);

    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "paused",
    );
  });

  it("pauses the bar while the tab is hidden and resumes on return", async () => {
    render(<WorkflowSteps />);
    await emitIntersection(1);

    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "running",
    );

    await setDocumentVisibility("hidden");

    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "paused",
    );

    await setDocumentVisibility("visible");

    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "running",
    );
  });

  it("shows the step a column is clicked for", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);

    await user.click(
      screen.getByRole("button", { name: /Ready for what's next/ }),
    );

    expect(
      screen.getByRole("button", { name: /Ready for what's next/ }),
    ).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Sarah accepted your quote")).toBeInTheDocument();
  });

  it("restarts the current step's bar when its column is clicked again", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);
    await emitIntersection(1);

    const originalBar = progressBarOf(/Request comes in/);

    await user.click(
      screen.getByRole("button", { name: /Request comes in/ }),
    );

    const restartedBar = progressBarOf(/Request comes in/);

    expect(restartedBar).not.toBe(originalBar);
    expect(restartedBar).toHaveAttribute("data-workflow-progress", "running");
  });

  it("wraps to the first step when the last step's bar fills", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);
    await emitIntersection(1);

    await user.click(
      screen.getByRole("button", { name: /Ready for what's next/ }),
    );

    const lastBar = progressBarOf(/Ready for what's next/);

    await finishProgressBar(lastBar);

    expect(
      screen.getByRole("button", { name: /Request comes in/ }),
    ).toHaveAttribute("aria-current", "step");
  });

  it("keeps the manual stepper, with no cycle, under reduced motion", async () => {
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

    render(<WorkflowSteps />);
    await emitIntersection(1);

    const bar = progressBarOf(/Request comes in/);

    // The active bar settles full and never runs, so nothing can hand the
    // cycle on.
    expect(bar).toHaveAttribute("data-workflow-progress", "static");

    await finishProgressBar(bar);

    expect(
      screen.getByRole("button", { name: /Request comes in/ }),
    ).toHaveAttribute("aria-current", "step");
  });
});
