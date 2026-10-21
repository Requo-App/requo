import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/notify", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/hooks/use-deferred-refresh", () => ({
  useDeferredRefresh: () => ({ scheduleRefresh: vi.fn(), refreshNow: vi.fn() }),
}));

import { FollowUpEditDialog } from "@/features/follow-ups/components/follow-up-edit-dialog";
import type { FollowUpView } from "@/features/follow-ups/types";

const followUp = {
  id: "follow-up", title: "Call Taylor", reason: "Check in", channel: "email",
  category: "sales", sendMode: "automatic", recurrence: "none",
  dueAt: new Date("2026-10-22T09:00:00Z"), businessTimezone: "UTC",
  businessPlan: "free", recurrenceLimit: null, terminationCondition: null,
} as FollowUpView;

afterEach(cleanup);

describe("follow-up edit send mode", () => {
  it.each([
    ["free", "automatic", "manual"],
    ["pro", "automatic", "automatic"],
    ["pro", "manual", "manual"],
  ] as const)("submits %s plan's %s mode as %s after reopening", async (businessPlan, sendMode, expected) => {
    const action = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();
    render(<FollowUpEditDialog action={action} followUp={{ ...followUp, businessPlan, sendMode }} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = action.mock.calls[0][1] as FormData;
    expect(formData.get("sendMode")).toBe(expected);
  });
});
