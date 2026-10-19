import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeltaPill } from "@/components/shared/delta-pill";
import { RankedBarList } from "@/features/analytics/components/charts/ranked-bar-list";
import { AnalyticsTabNav } from "@/features/analytics/components/controls/analytics-tab-nav";
import { UsageMeter } from "@/features/analytics/components/meters/usage-meter";
import { AnalyticsMetricTile } from "@/features/analytics/components/metric-tile";
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
 * These cover the shared vocabulary every tab renders — delta chips, metric
 * tiles, usage meters, ranked lists, empty states, and the tab bar's locked
 * state. Section components are server components (async) and are covered by
 * the query tests and route checks instead.
 */

describe("DeltaPill", () => {
  it("renders nothing without a delta", () => {
    const { container } = render(<DeltaPill delta={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("infers the direction from the sign and tints by sentiment", () => {
    render(<DeltaPill delta="+12%" sentiment="positive" />);
    const pill = screen.getByText("+12%");
    expect(pill.parentElement?.className).toContain("bg-success/10");
  });

  it("keeps direction and sentiment independent for lower-is-better metrics", () => {
    render(<DeltaPill delta="33% faster" direction="down" sentiment="positive" />);
    expect(screen.getByText("33% faster").parentElement?.className).toContain(
      "bg-success/10",
    );
  });

  it("falls back to the neutral tone", () => {
    render(<DeltaPill delta="No change" />);
    expect(screen.getByText("No change").parentElement?.className).toContain(
      "bg-muted",
    );
  });
});

describe("AnalyticsMetricTile", () => {
  it("renders label, value, and caption", () => {
    render(
      <AnalyticsMetricTile label="Win rate" value="42%" caption="Accepted ÷ decided" />,
    );

    expect(screen.getByText("Win rate")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Accepted ÷ decided")).toBeInTheDocument();
  });

  it("links when a drill-down href is provided", () => {
    render(<AnalyticsMetricTile label="Open" value="8" href="/acme/inquiries" />);
    expect(screen.getByRole("link", { name: /Open/ })).toHaveAttribute(
      "href",
      "/acme/inquiries",
    );
  });

  it("tints the value by tone", () => {
    render(<AnalyticsMetricTile label="Failed" value="3" tone="negative" />);
    expect(screen.getByText("3").className).toContain("text-destructive");
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

describe("RankedBarList", () => {
  const items = [
    { label: "Direct", count: 82, share: 0.82, href: null },
    { label: "google.com", count: 18, share: 0.18, href: "/acme/inquiries?source=service_form" },
  ];

  it("renders rows, defaults to counts, and links tagged items", () => {
    render(<RankedBarList items={items} />);

    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /google\.com/ })).toHaveAttribute(
      "href",
      "/acme/inquiries?source=service_form",
    );
  });

  it("accepts a value formatter for rate lists", () => {
    render(
      <RankedBarList
        items={[{ label: "Repairs", count: 21, share: 0.5, href: null }]}
        formatValue={(item) => `${Math.round(item.share * 100)}%`}
      />,
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows the empty label when there is nothing to rank", () => {
    render(<RankedBarList items={[]} emptyLabel="No form views in this period." />);
    expect(screen.getByText("No form views in this period.")).toBeInTheDocument();
  });
});

describe("analytics empty states", () => {
  it("points first-run workspaces at the two actions that create data", () => {
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
