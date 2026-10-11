import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { DashboardPageSkeleton } from "@/components/shell/dashboard-page-skeleton";
import { ProductsPageSkeleton } from "@/components/shell/products-page-skeleton";
import { ServicesPageSkeleton } from "@/components/shell/services-page-skeleton";
import {
  ListToolbarStripSkeleton,
  SectionHeaderSkeleton,
  StatTilesSkeleton,
} from "@/components/shared/skeleton-blocks";
import { AdminSectionsFallback } from "@/features/admin/components/admin-sections-fallback";

function stripOf(container: HTMLElement): Element | null {
  return container.querySelector(
    '[data-list-card] > .data-list-toolbar-strip',
  );
}

describe("StatTilesSkeleton", () => {
  it("renders four info tiles with the expected skeleton dimensions", () => {
    const { container } = render(<StatTilesSkeleton />);

    const grid = container.firstElementChild;
    expect(grid?.className).toContain("grid");
    expect(grid?.className).toContain("gap-3");
    expect(grid?.className).toContain("sm:grid-cols-2");
    expect(grid?.className).toContain("xl:grid-cols-4");

    const tiles = container.querySelectorAll(".info-tile");
    expect(tiles).toHaveLength(4);

    for (const tile of tiles) {
      const bars = tile.querySelectorAll('[data-slot="skeleton"]');
      expect(bars).toHaveLength(3);
      expect(bars[0].className).toContain("h-3");
      expect(bars[0].className).toContain("w-24");
      expect(bars[1].className).toContain("h-8");
      expect(bars[1].className).toContain("w-16");
      expect(bars[2].className).toContain("h-3");
      expect(bars[2].className).toContain("w-28");
    }
  });

  it("supports a custom tile count", () => {
    const { container } = render(<StatTilesSkeleton count={2} />);
    expect(container.querySelectorAll(".info-tile")).toHaveLength(2);
  });
});

describe("SectionHeaderSkeleton", () => {
  it("renders the default title/action widths with the section bar classes", () => {
    const { container } = render(<SectionHeaderSkeleton />);

    const bar = container.firstElementChild;
    expect(bar?.className).toContain("flex");
    expect(bar?.className).toContain("items-center");
    expect(bar?.className).toContain("justify-between");
    expect(bar?.className).toContain("border-b");
    expect(bar?.className).toContain("border-border/70");

    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars).toHaveLength(2);
    expect(bars[0].className).toContain("h-6");
    expect(bars[0].className).toContain("w-32");
    expect(bars[1].className).toContain("h-9");
    expect(bars[1].className).toContain("w-24");
    expect(bars[1].className).toContain("sm:h-8");
  });

  it("supports custom title/action widths", () => {
    const { container } = render(
      <SectionHeaderSkeleton
        titleClassName="h-6 w-36 rounded-md"
        actionClassName="h-9 w-28 rounded-md sm:h-8"
      />,
    );

    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars[0].className).toContain("w-36");
    expect(bars[1].className).toContain("w-28");
  });
});

describe("ListToolbarStripSkeleton", () => {
  it("renders the strip with search, one filter, clear, and count", () => {
    const { container } = render(<ListToolbarStripSkeleton filterCount={1} />);

    const strip = container.firstElementChild;
    expect(strip?.className).toContain("data-list-toolbar-strip");
    expect(strip).toHaveAttribute("aria-hidden", "true");
    expect(
      strip?.querySelector(".data-list-toolbar-grid"),
    ).not.toBeNull();

    const grid = strip?.querySelector(".data-list-toolbar-grid");
    const gridBars = grid?.querySelectorAll('[data-slot="skeleton"]') ?? [];
    // Search + 1 filter + clear button.
    expect(gridBars).toHaveLength(3);
    expect(gridBars[0].className).toContain("flex-1");
    expect(gridBars[1].className).toContain("sm:max-w-44");
    expect(gridBars[2].className).toContain("hidden");
    expect(gridBars[2].className).toContain("sm:block");

    // Result count line, no second row by default.
    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars[bars.length - 1].className).toContain("w-28");
    expect(container.querySelector(".max-w-xs")).toBeNull();
  });

  it("renders two filters for services and an optional second row", () => {
    const { container } = render(
      <ListToolbarStripSkeleton filterCount={2} withSecondRow />,
    );

    const grid = container.querySelector(".data-list-toolbar-grid");
    expect(
      grid?.querySelectorAll('[data-slot="skeleton"]'),
    ).toHaveLength(4);

    const secondRow = container.querySelector(".max-w-xs");
    expect(secondRow).not.toBeNull();
    expect(secondRow?.className).toContain("h-9");
    expect(secondRow?.className).toContain("sm:h-8");
  });
});

describe("consumer delegation", () => {
  it("products toolbar strip matches the shared atom output", () => {
    const { container: consumer } = render(<ProductsPageSkeleton />);
    const { container: atom } = render(
      <ListToolbarStripSkeleton filterCount={1} withSecondRow />,
    );

    expect(stripOf(consumer)?.outerHTML).toBe(
      atom.firstElementChild?.outerHTML,
    );
  });

  it("services toolbar strip matches the shared atom output", () => {
    const { container: consumer } = render(<ServicesPageSkeleton />);
    const { container: atom } = render(
      <ListToolbarStripSkeleton filterCount={2} />,
    );

    expect(stripOf(consumer)?.outerHTML).toBe(
      atom.firstElementChild?.outerHTML,
    );
  });

  it("admin tiles match the shared atom output", () => {
    const { container: consumer } = render(<AdminSectionsFallback />);
    const { container: atom } = render(<StatTilesSkeleton />);

    expect(
      consumer.querySelector(".grid.gap-3")?.outerHTML,
    ).toBe(atom.firstElementChild?.outerHTML);
  });

  it("dashboard tiles match the shared atom output", () => {
    const { container: consumer } = render(<DashboardPageSkeleton />);
    const { container: atom } = render(<StatTilesSkeleton />);

    expect(
      consumer.querySelector(".grid.gap-3")?.outerHTML,
    ).toBe(atom.firstElementChild?.outerHTML);
  });
});

describe("consumer page-specific structures", () => {
  it("products keeps its actions row, desktop rows, and mobile rows", () => {
    const { container } = render(<ProductsPageSkeleton />);

    // Actions row: hint + three buttons.
    expect(container.querySelector(".h-4.w-32")).not.toBeNull();
    expect(container.querySelector(".h-8.w-24")).not.toBeNull();

    // Desktop: 4 rows with icon + badge + menu; mobile: 3 stacked rows.
    expect(
      container.querySelectorAll(".hidden.sm\\:block > div"),
    ).toHaveLength(4);
    expect(
      container.querySelectorAll(".divide-y > div"),
    ).toHaveLength(3);
    expect(container.querySelector(".rounded-full.h-5, .h-5.w-16")).not.toBeNull();
  });

  it("services keeps its actions row, mobile cards, and desktop table", () => {
    const { container } = render(<ServicesPageSkeleton />);

    // Actions row: short hint + single button.
    expect(container.querySelector(".h-4.w-20")).not.toBeNull();
    expect(container.querySelector(".h-8.w-32")).not.toBeNull();

    // Mobile bordered cards (not divide-y rows) and desktop header + 3 rows.
    expect(
      container.querySelectorAll(".flex.flex-col.gap-2 > div"),
    ).toHaveLength(3);
    expect(
      container.querySelector(".rounded-xl.border"),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(".hidden.sm\\:block > div"),
    ).toHaveLength(4);
    expect(container.querySelector(".ml-auto")).not.toBeNull();
  });

  it("products and services stay distinct", () => {
    const { container: products } = render(<ProductsPageSkeleton />);
    const { container: services } = render(<ServicesPageSkeleton />);

    // Only products has the second filter row; only services has cards.
    expect(products.querySelector(".max-w-xs")).not.toBeNull();
    expect(services.querySelector(".max-w-xs")).toBeNull();
    expect(services.querySelector(".rounded-xl.border")).not.toBeNull();
    expect(products.querySelector(".rounded-xl.border")).toBeNull();
  });

  it("admin fallback keeps its body-only panel and row structure", () => {
    const { container } = render(<AdminSectionsFallback />);

    const root = container.firstElementChild;
    expect(root?.className).toContain("gap-6");

    const sections = container.querySelectorAll("section.section-panel");
    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section.className).toContain("space-y-4");
      const rows = section.querySelectorAll(".h-9.w-full.rounded-lg");
      expect(rows).toHaveLength(3);
    }
  });

  it("dashboard skeleton keeps its page shell and section counts", () => {
    const { container } = render(<DashboardPageSkeleton />);

    const panels = container.querySelectorAll("section.section-panel");
    // Hero + 4 grid sections + wide section + side panel.
    expect(panels.length).toBeGreaterThanOrEqual(7);
    expect(container.querySelectorAll(".info-tile").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector(".dashboard-actions")).not.toBeNull();
  });
});
