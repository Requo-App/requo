import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function ControlledCollapsible({ initial = false }: { initial?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger>Details</CollapsibleTrigger>
      <CollapsibleContent>
        <p>Hidden body copy</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

describe("Collapsible disclosure motion", () => {
  it("opens with the animated state and closes back", async () => {
    const user = userEvent.setup();
    render(<ControlledCollapsible />);

    // Radix keeps the closed content mounted but hidden.
    expect(
      document
        .querySelector('[data-slot="collapsible-content"]')
        ?.getAttribute("data-state"),
    ).toBe("closed");

    await user.click(screen.getByRole("button", { name: "Details" }));
    const content = document.querySelector(
      '[data-slot="collapsible-content"]',
    );
    expect(content?.getAttribute("data-state")).toBe("open");

    await user.click(screen.getByRole("button", { name: "Details" }));
    // jsdom never fires animationend, so Radix Presence keeps the closing
    // content mounted; browsers unmount it after the exit animation. Either
    // way the trigger must report the closed state.
    expect(
      screen.getByRole("button", { name: "Details" }).getAttribute("aria-expanded"),
    ).toBe("false");
    const closed = document.querySelector(
      '[data-slot="collapsible-content"]',
    );
    expect(
      closed === null || closed.getAttribute("data-state") === "closed",
    ).toBe(true);
  });

  it("does not stick after rapid toggling", async () => {
    const user = userEvent.setup();
    render(<ControlledCollapsible />);

    const trigger = screen.getByRole("button", { name: "Details" });
    await user.click(trigger);
    await user.click(trigger);
    await user.click(trigger);

    const content = document.querySelector(
      '[data-slot="collapsible-content"]',
    );
    expect(content?.getAttribute("data-state")).toBe("open");
    expect(screen.getByText("Hidden body copy")).toBeDefined();
  });

  it("keeps trigger keyboard operable", async () => {
    const user = userEvent.setup();
    render(<ControlledCollapsible />);

    const trigger = screen.getByRole("button", { name: "Details" });
    trigger.focus();
    await user.keyboard(" ");
    expect(
      document
        .querySelector('[data-slot="collapsible-content"]')
        ?.getAttribute("data-state"),
    ).toBe("open");
  });
});

function TabsHarness() {
  const [value, setValue] = useState("one");
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList>
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two words</TabsTrigger>
        <TabsTrigger value="three">Three</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function stubTabGeometry() {
  const tabs = screen.getAllByRole("tab");
  const widths = [60, 120, 80];
  tabs.forEach((tab, index) => {
    Object.defineProperty(tab, "offsetLeft", {
      configurable: true,
      value: widths.slice(0, index).reduce((a, b) => a + b, 0),
    });
    Object.defineProperty(tab, "offsetTop", { configurable: true, value: 0 });
    Object.defineProperty(tab, "offsetWidth", {
      configurable: true,
      value: widths[index],
    });
    Object.defineProperty(tab, "offsetHeight", {
      configurable: true,
      value: 32,
    });
  });
}

describe("Tabs sliding indicator", () => {
  it("renders a traveling indicator over the active tab", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    stubTabGeometry();

    // Re-trigger measurement after geometry stubs land.
    await user.click(screen.getByRole("tab", { name: "Two words" }));

    const indicator = document.querySelector('[data-slot="tabs-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator?.getAttribute("aria-hidden")).toBe("true");
  });

  it("retargets to the newly selected tab without sticking", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    stubTabGeometry();

    await user.click(screen.getByRole("tab", { name: "Two words" }));
    await waitFor(() => {
      const indicator = document.querySelector(
        '[data-slot="tabs-indicator"]',
      ) as HTMLElement | null;
      expect(indicator?.style.transform).toContain("60px");
    });

    await user.click(screen.getByRole("tab", { name: "Three" }));
    // Third tab starts at 60 + 120 = 180px.
    await waitFor(() => {
      const moved = (
        document.querySelector(
          '[data-slot="tabs-indicator"]',
        ) as HTMLElement | null
      )?.style.transform;
      expect(moved).toContain("180px");
    });

    // Rapid back-and-forth lands on the latest selection.
    await user.click(screen.getByRole("tab", { name: "One" }));
    await user.click(screen.getByRole("tab", { name: "Two words" }));
    const finalTab = screen.getByRole("tab", { name: "Two words" });
    expect(finalTab.getAttribute("data-state")).toBe("active");
    await waitFor(() => {
      const finalIndicator = (
        document.querySelector(
          '[data-slot="tabs-indicator"]',
        ) as HTMLElement | null
      )?.style.transform;
      expect(finalIndicator).toContain("60px");
    });
  });

  it("preserves Radix tab semantics and keyboard movement", async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    stubTabGeometry();

    const first = screen.getByRole("tab", { name: "One" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(
      screen.getByRole("tab", { name: "Two words" }).getAttribute("data-state"),
    ).toBe("active");
  });

  it("unmounts without observer errors", () => {
    const { unmount } = render(<TabsHarness />);
    expect(() => {
      act(() => {
        unmount();
      });
    }).not.toThrow();
  });
});
