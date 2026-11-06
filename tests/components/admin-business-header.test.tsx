import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminBusinessHeaderSection } from "@/features/admin/components/admin-business-detail";
import type { AdminBusinessBilling, AdminBusinessDetailCore } from "@/features/admin/types";

vi.mock("@/features/admin/mutations", () => ({
  archiveBusinessAction: vi.fn(),
  cancelBusinessSubscriptionAction: vi.fn(),
  deleteBusinessAction: vi.fn(),
  overridePlanTierAction: vi.fn(),
  restoreBusinessAction: vi.fn(),
}));
vi.mock("@/hooks/use-deferred-refresh", () => ({
  useDeferredRefresh: () => ({ scheduleRefresh: vi.fn() }),
}));

const detail: AdminBusinessDetailCore = {
  id: "business-1", name: "Acme", slug: "acme", plan: "pro",
  ownerUserId: "owner-1", ownerName: "Owner", ownerEmail: "owner@example.test",
  memberCount: 1, inquiryCount: 0, quoteCount: 0,
  lastInquiryAt: null, lastQuoteSentAt: null, archivedAt: null, deletedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};
const billing: AdminBusinessBilling = {
  businessId: detail.id, plan: "pro",
  subscription: {
    id: "subscription-1", plan: "pro", status: "active", provider: "polar",
    currentPeriodEnd: null, canceledAt: null,
  },
};

describe("admin business header deployment mode", () => {
  it("hides plan controls while retaining lifecycle actions in self-hosted mode", () => {
    render(<AdminBusinessHeaderSection billing={billing} detail={detail} isSelfHosted />);
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change plan" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel subscription" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  it("keeps Cloud plan controls and uses the loaded subscription", () => {
    render(<AdminBusinessHeaderSection billing={billing} detail={detail} isSelfHosted={false} />);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change plan" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel subscription" })).toBeEnabled();
  });

  it("keeps Cloud lifecycle and plan controls when billing fails", () => {
    render(<AdminBusinessHeaderSection billing={null} detail={detail} isSelfHosted={false} />);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change plan" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel subscription" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archive" })).toBeEnabled();
  });
});
