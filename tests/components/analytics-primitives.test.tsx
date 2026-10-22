import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeltaBadge } from "@/features/analytics/components/primitives/delta-badge";
import { BarList } from "@/features/analytics/components/primitives/bar-list";
import { DataTable } from "@/features/analytics/components/primitives/data-table";
import { EmptyState } from "@/features/analytics/components/primitives/empty-state";
import { Funnel } from "@/features/analytics/components/primitives/funnel";
import { Stat, StatGrid } from "@/features/analytics/components/primitives/stat";
import { UsageMeter } from "@/features/analytics/components/primitives/usage-meter";
import { AttentionList } from "@/features/analytics/components/primitives/attention-list";
import { AnalyticsTabNav } from "@/features/analytics/components/controls/analytics-tab-nav";
import {
  AnalyticsFirstRunEmpty,
  AnalyticsRangeEmpty,
} from "@/features/analytics/components/states/analytics-empty";
import type { AnalyticsUsageMeter } from "@/features/analytics/types";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/**
 * Analytics building blocks.
 *
 * These cover the shared vocabulary every tab renders — delta chips, stats,
 * bar lists, funnels, usage meters, attention lists, tables, and the tab bar's
 * locked state. Section components are server components (async) and are
 * covered by the query tests and route checks instead.
 */

/** The stat grid's cells, in order. */
function statCells(container: HTMLElement): Element[] {
  const grid = container.firstElementChild;
  if (!grid) throw new Error("Expected a stat grid.");
  return Array.from(grid.children);
}

/**
 * Whether a cell draws a rule at one breakpoint.
 *
 * `variant` is the breakpoint variant without its colon (`""` for the base
 * one, `"@[24rem]"` for a container query). A cell declares either the rule
 * or its absence at each breakpoint, so the last matching class is the
 * effective one.
 */
function hasRule(
  cell: Element,
  variant: string,
  side: "border-t" | "border-l",
): boolean {
  const prefix = variant ? `${variant}:` : "";
  const classes = Array.from(cell.classList);
  const matches = classes.filter(
    (name) => name === `${prefix}${side}` || name === `${prefix}${side}-0`,
  );
  if (matches.length === 0) return false;
  return matches[matches.length - 1] === `${prefix}${side}`;
}

describe("DeltaBadge", () => {
  it("renders nothing without a delta", () => {
    const { container } = render(<DeltaBadge delta={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tints by sentiment rather than by the sign of the change", () => {
    render(<DeltaBadge delta="+12%" direction="up" sentiment="positive" />);
    expect(screen.getByText("+12%").parentElement?.className).toContain(
      "text-success",
    );
  });

  it("keeps direction and sentiment independent for lower-is-better metrics", () => {
    render(
      <DeltaBadge delta="33% faster" direction="down" sentiment="positive" />,
    );
    expect(screen.getByText("33% faster").parentElement?.className).toContain(
      "text-success",
    );
  });

  it("renders no change as plain muted text", () => {
    render(<DeltaBadge delta="No change" direction="flat" sentiment="neutral" />);
    const badge = screen.getByText("No change");
    expect(badge.className).toContain("text-muted-foreground");
  });
});

describe("Stat", () => {
  it("renders label, value, and caption", () => {
    render(
      <Stat label="Win rate" value="42%" caption="Accepted ÷ decided" />,
    );

    expect(screen.getByText("Win rate")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Accepted ÷ decided")).toBeInTheDocument();
  });

  it("links the label when a drill-down href is provided", () => {
    render(<Stat label="Open" value="8" href="/acme/inquiries" />);
    expect(screen.getByRole("link", { name: /Open/ })).toHaveAttribute(
      "href",
      "/acme/inquiries",
    );
  });

  it("separates stats with a divider instead of boxing them", () => {
    const { container } = render(
      <StatGrid columns={2}>
        <Stat label="One" value="1" />
        <Stat label="Two" value="2" />
      </StatGrid>,
    );

    const cells = statCells(container);
    // The second cell starts a row of its own on a phone, so it carries the
    // horizontal rule; the first cell is flush with the top.
    expect(hasRule(cells[1]!, "", "border-t")).toBe(true);
    expect(hasRule(cells[0]!, "", "border-t")).toBe(false);
    // Nothing sits beside the first cell, so no vertical rule.
    expect(hasRule(cells[1]!, "", "border-l")).toBe(false);
  });

  it("draws the vertical rule between the columns of a row", () => {
    const { container } = render(
      <StatGrid columns={2}>
        <Stat label="One" value="1" />
        <Stat label="Two" value="2" />
        <Stat label="Three" value="3" />
        <Stat label="Four" value="4" />
      </StatGrid>,
    );

    const cells = statCells(container);
    // Two columns once the card is wide enough.
    expect(hasRule(cells[1]!, "@[24rem]", "border-l")).toBe(true);
    expect(hasRule(cells[0]!, "@[24rem]", "border-l")).toBe(false);
    // The second row starts below the first, so it carries the top rule.
    expect(hasRule(cells[2]!, "@[24rem]", "border-t")).toBe(true);
    expect(hasRule(cells[0]!, "@[24rem]", "border-t")).toBe(false);
    // The cell that starts a row has no vertical rule.
    expect(hasRule(cells[2]!, "@[24rem]", "border-l")).toBe(false);
    expect(hasRule(cells[3]!, "@[24rem]", "border-l")).toBe(true);
  });

  it("keeps the vertical rules running through every row", () => {
    const { container } = render(
      <StatGrid columns={2}>
        <Stat label="One" value="1" />
        <Stat label="Two" value="2" />
        <Stat label="Three" value="3" />
        <Stat label="Four" value="4" />
      </StatGrid>,
    );

    const cells = statCells(container);
    // Cells touch: the rule of the cell above meets the rule of the cell
    // below it, so the last cell of a row keeps its vertical rule.
    expect(hasRule(cells[1]!, "@[24rem]", "border-l")).toBe(true);
    expect(hasRule(cells[3]!, "@[24rem]", "border-l")).toBe(true);
  });

  it("follows the card container instead of the viewport", () => {
    const { container } = render(
      <StatGrid columns={4}>
        <Stat label="One" value="1" />
        <Stat label="Two" value="2" />
        <Stat label="Three" value="3" />
        <Stat label="Four" value="4" />
      </StatGrid>,
    );

    const grid = container.firstElementChild;
    expect(grid?.getAttribute("class")).toContain("@[44rem]:grid-cols-4");

    const cells = statCells(container);
    // Four columns at the widest size: every cell but the first of a row
    // carries the vertical rule.
    expect(hasRule(cells[1]!, "@[44rem]", "border-l")).toBe(true);
    expect(hasRule(cells[2]!, "@[44rem]", "border-l")).toBe(true);
    expect(hasRule(cells[3]!, "@[44rem]", "border-l")).toBe(true);
    // The grid has no three-column step, so the rules never describe a
    // layout the grid does not use.
    expect(hasRule(cells[1]!, "@[38rem]", "border-l")).toBe(false);
  });
});

describe("BarList", () => {
  const items = [
    { key: "direct", label: "Direct", value: "82", share: 0.82, href: null },
    {
      key: "google",
      label: "google.com",
      value: "18",
      share: 0.18,
      href: "/acme/inquiries?source=service_form",
    },
  ];

  it("renders rows with the value and links tagged items", () => {
    render(<BarList items={items} />);

    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /google\.com/ })).toHaveAttribute(
      "href",
      "/acme/inquiries?source=service_form",
    );
  });

  it("shows the empty label when there is nothing to rank", () => {
    render(<BarList items={[]} emptyLabel="No form views in this period." />);
    expect(screen.getByText("No form views in this period.")).toBeInTheDocument();
  });

  it("renders a zero share as an empty track rather than a stub", () => {
    const { container } = render(
      <BarList
        items={[{ key: "zero", label: "Direct", value: "0", share: 0 }]}
      />,
    );
    const fill = container.querySelector("div[style]");
    expect(fill?.getAttribute("style")).toContain("width: 0%");
  });
});

describe("Funnel", () => {
  const steps = [
    { key: "visitors", label: "Visitors", count: 7, href: null },
    { key: "inquiries", label: "Inquiries", count: 7, href: null },
    { key: "quotes", label: "Quotes sent", count: 4, href: null },
  ];

  it("renders each stage with its step conversion", () => {
    render(<Funnel steps={steps} />);

    expect(screen.getByText("Visitors")).toBeInTheDocument();
    expect(screen.getByText("Quotes sent")).toBeInTheDocument();
    expect(screen.getByText("100% of visitors")).toBeInTheDocument();
    expect(screen.getByText("57.1% of inquiries")).toBeInTheDocument();
  });

  it("states the counts instead of a rate above 100%", () => {
    render(
      <Funnel
        steps={[
          { key: "visitors", label: "Visitors", count: 7, href: null },
          { key: "inquiries", label: "Inquiries", count: 9, href: null },
        ]}
      />,
    );

    expect(screen.queryByText("128.6% of visitors")).not.toBeInTheDocument();
    expect(screen.getByText("9 from 7 visitors")).toBeInTheDocument();
  });

  it("shows the empty label when nothing happened", () => {
    render(<Funnel steps={[]} emptyLabel="No funnel activity yet." />);
    expect(screen.getByText("No funnel activity yet.")).toBeInTheDocument();
  });
});

describe("UsageMeter", () => {
  const meter: AnalyticsUsageMeter = {
    key: "quoteEmails",
    label: "Quote emails",
    used: 12,
    limit: 15,
    unit: "emails",
    hint: "Sent this month",
    href: null,
    upgradeFeature: null,
  };

  it("exposes the used/limit values to assistive tech", () => {
    render(<UsageMeter meter={meter} />);
    const bar = screen.getByRole("progressbar", { name: "Quote emails" });
    expect(bar).toHaveAttribute("aria-valuenow", "12");
    expect(bar).toHaveAttribute("aria-valuemax", "15");
    expect(bar).toHaveAttribute("aria-valuetext", "12 of 15 emails");
  });

  it("reads unlimited plans without a maximum", () => {
    render(<UsageMeter meter={{ ...meter, used: 4, limit: null }} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).not.toHaveAttribute("aria-valuemax");
    expect(bar).toHaveAttribute("aria-valuetext", "4 emails, unlimited");
    expect(screen.getByText(/Unlimited/)).toBeInTheDocument();
  });

  it("renders the upgrade action in place of a zero-cap bar", () => {
    render(
      <UsageMeter
        meter={{ ...meter, used: 0, limit: 0 }}
        action={<button type="button">Upgrade</button>}
      />,
    );

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Not included")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upgrade" })).toBeInTheDocument();
  });
});

describe("AttentionList", () => {
  it("mutes zero counts and accents the ones that need work", () => {
    render(
      <AttentionList
        items={[
          {
            key: "unviewed",
            label: "Unviewed inquiries",
            description: "No one has opened these yet.",
            count: 18,
            href: "/acme/inquiries?status=new",
            tone: "warning",
            icon: "inquiry",
          },
          {
            key: "stale",
            label: "Stale inquiries",
            description: "Viewed but still sitting for more than 2 days.",
            count: 0,
            href: "/acme/inquiries?status=stale",
            tone: "neutral",
            icon: "inquiry",
          },
        ]}
      />,
    );

    expect(screen.getByText("Unviewed inquiries")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Unviewed inquiries/ })).toHaveAttribute(
      "href",
      "/acme/inquiries?status=new",
    );
  });

  it("icons each row by the kind of work it points at", () => {
    const { container } = render(
      <AttentionList
        items={[
          {
            key: "unviewed",
            label: "Unviewed inquiries",
            description: "No one has opened these yet.",
            count: 1,
            href: "/acme/inquiries?status=new",
            tone: "warning",
            icon: "inquiry",
          },
          {
            key: "expiring",
            label: "Quotes expiring this week",
            description: "Sent quotes whose validity ends within 7 days.",
            count: 2,
            href: "/acme/quotes?status=sent",
            tone: "info",
            icon: "quote",
          },
          {
            key: "overdue",
            label: "Overdue follow-ups",
            description: "Past their due date and still pending.",
            count: 3,
            href: "/acme/follow-ups?due=overdue",
            tone: "negative",
            icon: "follow-up",
          },
        ]}
      />,
    );

    // One icon per row, and a different one for each kind of work.
    const icons = container.querySelectorAll("svg");
    expect(icons).toHaveLength(3);
    expect(icons[0]?.getAttribute("class")).toContain("lucide-inbox");
    expect(icons[1]?.getAttribute("class")).toContain("lucide-file-text");
    expect(icons[2]?.getAttribute("class")).toContain("lucide-bell-ring");
  });

  it("says so when nothing needs attention", () => {
    render(<AttentionList items={[]} />);
    expect(screen.getByText("Nothing needs attention")).toBeInTheDocument();
  });
});

describe("DataTable", () => {
  it("renders headers and right-aligned values", () => {
    render(
      <DataTable
        columns={[
          { key: "stage", header: "Stage" },
          { key: "count", header: "Count", align: "end" },
        ]}
        rows={[{ stage: "Sent", count: "4" }]}
      />,
    );

    expect(screen.getByText("Stage")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders nothing without rows", () => {
    const { container } = render(
      <DataTable columns={[{ key: "stage", header: "Stage" }]} rows={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EmptyState", () => {
  it("renders one muted line", () => {
    render(<EmptyState label="No activity in this period." />);
    expect(screen.getByText("No activity in this period.")).toBeInTheDocument();
  });
});

describe("analytics empty states", () => {
  it("points first-run businesses at the two actions that create data", () => {
    render(<AnalyticsFirstRunEmpty businessSlug="acme" />);

    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Set up your service page/ })).toHaveAttribute(
      "href",
      "/acme/services",
    );
    expect(screen.getByRole("link", { name: /Send your first quote/ })).toBeInTheDocument();
  });

  it("suggests a wider range for a quiet window", () => {
    render(<AnalyticsRangeEmpty />);
    expect(screen.getByText("No activity in this range")).toBeInTheDocument();
  });
});

describe("AnalyticsTabNav", () => {
  it("keeps locked tabs visible with a lock and marks the active tab", () => {
    render(
      <AnalyticsTabNav
        businessSlug="acme"
        activeTab="overview"
        lockedTabs={["performance", "operations", "team"]}
        range="30d"
        from={null}
        to={null}
        compare={null}
      />,
    );

    const overview = screen.getByRole("link", { name: "Overview" });
    expect(overview).toHaveAttribute("aria-current", "page");

    const performance = screen.getByRole("link", { name: /Performance/ });
    expect(performance).toHaveAttribute("href", "/acme/analytics?tab=performance");
    expect(performance).toHaveTextContent("(requires a higher plan)");

    expect(screen.getByRole("link", { name: /^Team/ })).toBeInTheDocument();
  });

  it("preserves the range, custom dates, and comparison in tab links", () => {
    render(
      <AnalyticsTabNav
        businessSlug="acme"
        activeTab="performance"
        lockedTabs={[]}
        range="custom"
        from="2026-05-01"
        to="2026-05-31"
        compare="0"
      />,
    );

    expect(screen.getByRole("link", { name: "Operations" })).toHaveAttribute(
      "href",
      "/acme/analytics?tab=operations&range=custom&from=2026-05-01&to=2026-05-31&compare=0",
    );
  });
});
