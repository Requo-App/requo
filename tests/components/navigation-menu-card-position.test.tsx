import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

/**
 * The shared viewport card must sit on the active trigger, not the menu root:
 * Radix only exposes the viewport's width/height, so the card translates
 * horizontally to the open item's offset. jsdom has no layout, so each item's
 * `offsetLeft` is stubbed before opening.
 */

function renderNav() {
  return render(
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Product</NavigationMenuTrigger>
          <NavigationMenuContent>Product content</NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Solutions</NavigationMenuTrigger>
          <NavigationMenuContent>Solutions content</NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>,
  );
}

function viewportContainer(): HTMLElement {
  const viewport = document.querySelector(
    '[data-slot="navigation-menu-viewport"]',
  );
  if (!viewport?.parentElement) {
    throw new Error("navigation menu viewport not rendered");
  }
  return viewport.parentElement as HTMLElement;
}

function stubItemOffsets(...offsets: number[]) {
  const items = document.querySelectorAll('[data-slot="navigation-menu-item"]');
  offsets.forEach((offset, index) => {
    Object.defineProperty(items[index], "offsetLeft", { value: offset });
  });
}

async function openTrigger(user: UserEvent, name: string) {
  await user.click(screen.getByRole("button", { name }));
  // The MutationObserver callback is a microtask; flush it inside act.
  await act(async () => {});
}

describe("navigation menu viewport position", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("translates the shared card to the open trigger's offset", async () => {
    const user = userEvent.setup();
    renderNav();
    stubItemOffsets(24, 208);

    await openTrigger(user, "Product");
    const container = viewportContainer();
    expect(container.style.transform).toBe("translateX(24px)");

    await openTrigger(user, "Solutions");
    expect(container.style.transform).toBe("translateX(208px)");

    await openTrigger(user, "Product");
    expect(container.style.transform).toBe("translateX(24px)");
  });

  it("sizes the shared card from the open panel's layout box", async () => {
    const user = userEvent.setup();
    renderNav();
    stubItemOffsets(24, 208);

    /*
     * jsdom has no layout. Give the two panels deliberately different sizes so
     * the assertion proves the card follows whichever panel is open. The card
     * must resize synchronously instead of waiting on Radix's async measurement.
     */
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.textContent?.includes("Solutions") ? 336 : 672;
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.textContent?.includes("Solutions") ? 307 : 243;
      },
    );

    await openTrigger(user, "Product");
    const container = viewportContainer();
    expect(
      container.style.getPropertyValue("--navigation-menu-panel-width"),
    ).toBe("672px");
    expect(
      container.style.getPropertyValue("--navigation-menu-panel-height"),
    ).toBe("243px");

    await openTrigger(user, "Solutions");
    expect(
      container.style.getPropertyValue("--navigation-menu-panel-width"),
    ).toBe("336px");
    expect(
      container.style.getPropertyValue("--navigation-menu-panel-height"),
    ).toBe("307px");
  });
});
