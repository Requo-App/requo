import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardGreeting } from "@/features/businesses/components/dashboard-greeting";
import type { BusinessOverviewCounts } from "@/features/businesses/types";
import type { FollowUpOverviewData } from "@/features/follow-ups/types";

/**
 * The dashboard greeting reads the viewer's clock, which the server cannot
 * know. It therefore renders a stable copy on the server and the local
 * time-of-day greeting once the client has hydrated — the same pattern the
 * analytics freshness caption uses.
 */
describe("DashboardGreeting", () => {
  const counts: BusinessOverviewCounts = {
    overdueInquiries: 1,
    expiringSoonQuotes: 0,
    newInquiries: 2,
    recentAcceptedQuotes: 0,
    declinedQuotes: 0,
    draftQuotes: 0,
    awaitingResponseQuotes: 0,
  };

  const followUpCounts: FollowUpOverviewData["counts"] = {
    overdue: 0,
    dueToday: 1,
    upcoming: 0,
  };

  it("greets the owner by first name", () => {
    render(
      <DashboardGreeting
        counts={counts}
        followUpCounts={followUpCounts}
        userName="Morgan Lee"
      />,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Morgan");
  });

  it("summarises the urgent and new counts", () => {
    render(
      <DashboardGreeting
        counts={counts}
        followUpCounts={followUpCounts}
        userName="Morgan Lee"
      />,
    );

    expect(
      screen.getByText(
        "1 urgent item and 3 new items since your last visit.",
      ),
    ).toBeInTheDocument();
  });

  it("says so when there is nothing to do", () => {
    render(
      <DashboardGreeting
        counts={{ ...counts, newInquiries: 0, overdueInquiries: 0 }}
        followUpCounts={{ overdue: 0, dueToday: 0, upcoming: 0 }}
        userName="Morgan Lee"
      />,
    );

    expect(
      screen.getByText("You're all caught up — no urgent items right now."),
    ).toBeInTheDocument();
  });
});
