import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkflowSteps } from "@/components/marketing/workflow-steps";

/**
 * "How it works" tour tests.
 *
 * The tour advances on its own, so these pin the contract that keeps it safe:
 * it is a tablist with one exposed description at a time, the rail runs only
 * while the tour is in view on a visible tab, hovering or focusing does not
 * pause it, a manual pick restarts the cycle rather than stopping it, the Pause
 * tour control freezes and resumes the cycle, arrow keys move between tabs, the
 * cycle hands on when the active rail fills — even if it fills exactly as the
 * tour leaves view — wraps at the end, and reduced motion keeps the manual tour
 * with a settled rail and no cycle.
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

function tabOf(stepName: RegExp) {
  return screen.getByRole("tab", { name: stepName });
}

function progressBarOf(stepName: RegExp) {
  const bar = tabOf(stepName).querySelector("[data-workflow-progress]");

  expect(bar).not.toBeNull();

  return bar as HTMLElement;
}

function activePreview() {
  const preview = document.querySelector('[data-workflow-preview="active"]');

  expect(preview).not.toBeNull();

  return within(preview as HTMLElement);
}

/**
 * End the active rail's fill.
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
  it("exposes the tour as tabs and describes only the active step", () => {
    render(<WorkflowSteps />);

    const tablist = screen.getByRole("tablist", { name: "How it works" });

    expect(tablist).toHaveAttribute("aria-orientation", "vertical");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(4);

    const firstTab = tabOf(/Request comes in/);

    expect(firstTab).toHaveAttribute("aria-selected", "true");
    expect(firstTab).toHaveAttribute("tabindex", "0");
    expect(tabOf(/Quote sent same day/)).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(tabOf(/Quote sent same day/)).toHaveAttribute("tabindex", "-1");

    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(
      /Request comes in/,
    );

    // Only the active step's description is exposed; the rest stay collapsed
    // in the tab list. Every description reserves the tallest copy's height,
    // so switching steps does not move the section.
    expect(
      screen
        .getByText(/Customer fills out your form/)
        .closest("[data-workflow-description]"),
    ).toHaveAttribute("aria-hidden", "false");
    expect(
      screen
        .getByText(/AI drafts line items/)
        .closest("[data-workflow-description]"),
    ).toHaveAttribute("aria-hidden", "true");

    expect(activePreview().getByText("Sarah Jenkins")).toBeInTheDocument();
  });

  it("hands the cycle to the next step when the active rail fills", async () => {
    render(<WorkflowSteps />);
    await emitIntersection(1);

    const firstBar = progressBarOf(/Request comes in/);

    expect(firstBar).toHaveAttribute("data-workflow-progress", "running");

    await finishProgressBar(firstBar);

    expect(tabOf(/Quote sent same day/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(activePreview().getByText("Send quote")).toBeInTheDocument();
  });

  it("hands a finished rail on even when the tour leaves view as it fills", async () => {
    render(<WorkflowSteps />);
    await emitIntersection(1);

    const firstBar = progressBarOf(/Request comes in/);

    // The fill can end in the same task the gate closes (scroll-out or hidden
    // tab), so the queued `animationend` arrives after the pause commits.
    await emitIntersection(0.1);
    await finishProgressBar(firstBar);

    expect(tabOf(/Quote sent same day/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("runs the rail only while the tour is in view", async () => {
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

  it("keeps the rail running while the visitor hovers or focuses inside the tour", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);
    await emitIntersection(1);

    const root = document.querySelector("[data-workflow-root]") as HTMLElement;

    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "running",
    );

    await user.hover(root);
    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "running",
    );

    await user.unhover(root);
    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "running",
    );

    await user.tab();
    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "running",
    );

    act(() => {
      (document.activeElement as HTMLElement).blur();
    });

    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "running",
    );
  });

  it("pauses the rail while the tab is hidden and resumes on return", async () => {
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

  it("shows the step a tab is clicked for", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);

    await user.click(tabOf(/Ready for what's next/));

    expect(tabOf(/Ready for what's next/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      activePreview().getByText("Sarah accepted your quote"),
    ).toBeInTheDocument();
  });

  it("restarts the cycle at the step the visitor picks", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);
    await emitIntersection(1);

    await user.click(tabOf(/Quote sent same day/));

    const selectedBar = progressBarOf(/Quote sent same day/);

    expect(selectedBar).toHaveAttribute("data-workflow-progress", "running");
    expect(selectedBar).toHaveClass("animate-workflow-progress");

    await finishProgressBar(selectedBar);

    // Picking a step does not stop the tour; the next step takes over.
    expect(tabOf(/Follow up/)).toHaveAttribute("aria-selected", "true");
    expect(tabOf(/Quote sent same day/)).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it.each(["click", "Home", "End"])(
    "restarts the rail when %s reselects the active step",
    async (selection) => {
      const user = userEvent.setup();
      const stepName =
        selection === "End" ? /Ready for what's next/ : /Request comes in/;

      render(<WorkflowSteps />);
      await emitIntersection(1);
      await user.click(tabOf(stepName));

      const previousBar = progressBarOf(stepName);

      if (selection === "click") {
        await user.click(tabOf(stepName));
      } else {
        await user.keyboard(`{${selection}}`);
      }

      const restartedBar = progressBarOf(stepName);

      // A fresh animated element starts a new fill even if the tab is unchanged.
      expect(previousBar).not.toBeInTheDocument();
      expect(restartedBar).toHaveClass("animate-workflow-progress");
      expect(restartedBar).toHaveStyle({ animationPlayState: "running" });
      expect(tabOf(stepName)).toHaveAttribute("aria-selected", "true");
      expect(tabOf(stepName)).toHaveFocus();

      await finishProgressBar(restartedBar);

      expect(
        tabOf(selection === "End" ? /Request comes in/ : /Quote sent same day/),
      ).toHaveAttribute("aria-selected", "true");
    },
  );

  it("freezes and resumes the cycle with the Pause tour control", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);
    await emitIntersection(1);

    const bar = progressBarOf(/Request comes in/);

    expect(bar).toHaveAttribute("data-workflow-progress", "running");
    expect(bar).toHaveStyle({ animationPlayState: "running" });

    await user.click(screen.getByRole("button", { name: "Pause tour" }));

    // The rail freezes where it is instead of settling or handing on.
    expect(bar).toHaveAttribute("data-workflow-progress", "paused");
    expect(bar).toHaveStyle({ animationPlayState: "paused" });
    expect(
      screen.getByRole("button", { name: "Play tour" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Play tour" }));

    expect(bar).toHaveAttribute("data-workflow-progress", "running");
    expect(bar).toHaveStyle({ animationPlayState: "running" });
  });

  it("ignores a queued animation end after pausing the tour", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);
    await emitIntersection(1);

    const bar = progressBarOf(/Request comes in/);

    await user.click(screen.getByRole("button", { name: "Pause tour" }));
    await finishProgressBar(bar);

    expect(tabOf(/Request comes in/)).toHaveAttribute("aria-selected", "true");
    expect(activePreview().getByText("Sarah Jenkins")).toBeInTheDocument();
    expect(bar).toHaveStyle({ animationPlayState: "paused" });

    await user.click(screen.getByRole("button", { name: "Play tour" }));
    await finishProgressBar(bar);

    expect(tabOf(/Quote sent same day/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("moves between tabs with the keyboard", async () => {
    const user = userEvent.setup();

    render(<WorkflowSteps />);

    tabOf(/Request comes in/).focus();

    await user.keyboard("{ArrowDown}");

    expect(tabOf(/Quote sent same day/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.activeElement).toBe(tabOf(/Quote sent same day/));

    await user.keyboard("{End}");

    expect(tabOf(/Ready for what's next/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.activeElement).toBe(tabOf(/Ready for what's next/));

    await user.keyboard("{Home}");

    expect(tabOf(/Request comes in/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.activeElement).toBe(tabOf(/Request comes in/));
    expect(progressBarOf(/Request comes in/)).toHaveAttribute(
      "data-workflow-progress",
      "paused",
    );
  });

  it.each([
    ["ArrowRight", /Quote sent same day/],
    ["ArrowDown", /Quote sent same day/],
    ["ArrowLeft", /Ready for what's next/],
    ["ArrowUp", /Ready for what's next/],
  ])(
    "moves from the focused tab with %s after auto-advance",
    async (key, nextStep) => {
      const user = userEvent.setup();

      render(<WorkflowSteps />);
      await emitIntersection(1);

      const firstTab = tabOf(/Request comes in/);

      firstTab.focus();
      await finishProgressBar(progressBarOf(/Request comes in/));

      expect(tabOf(/Quote sent same day/)).toHaveAttribute("aria-selected", "true");
      expect(firstTab).toHaveFocus();

      await user.keyboard(`{${key}}`);

      expect(tabOf(nextStep)).toHaveAttribute("aria-selected", "true");
      expect(tabOf(nextStep)).toHaveFocus();
    },
  );

  it("wraps to the first step when the last step's rail fills", async () => {
    render(<WorkflowSteps />);
    await emitIntersection(1);

    // Let the cycle walk from Capture to Accepted, then finish Accepted.
    await finishProgressBar(progressBarOf(/Request comes in/));
    await finishProgressBar(progressBarOf(/Quote sent same day/));
    await finishProgressBar(progressBarOf(/Follow up/));
    await finishProgressBar(progressBarOf(/Ready for what's next/));

    expect(tabOf(/Request comes in/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps the manual tour, with no cycle, under reduced motion", async () => {
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

    // The active rail settles full and never runs, so nothing can hand the
    // cycle on.
    expect(bar).toHaveAttribute("data-workflow-progress", "static");
    expect(bar).not.toHaveClass("animate-workflow-progress");

    await finishProgressBar(bar);

    expect(tabOf(/Request comes in/)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
